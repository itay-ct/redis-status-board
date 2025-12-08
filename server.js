const express = require('express');
const cors = require('cors');
const path = require('path');
const redis = require('./redis-dal');
const { pipeline } = require('@xenova/transformers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// SERVER-SENT EVENTS (SSE) for real-time updates
// ============================================================================

const sseClients = new Set();

function sendToAllClients(message) {
  sseClients.forEach(client => {
    client.write(`data: ${JSON.stringify(message)}\n\n`);
  });
}

// ============================================================================
// EMBEDDING MODEL & VECTOR SEARCH
// ============================================================================

let embeddingModel = null;

/**
 * Initialize the embedding model (lazy loading)
 */
async function getEmbeddingModel() {
  if (!embeddingModel) {
    console.log('[Embeddings] Loading sentence-transformers/all-MiniLM-L6-v2 model...');
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[Embeddings] Model loaded successfully');
  }
  return embeddingModel;
}

/**
 * Generate embedding vector for a text
 */
async function generateEmbedding(text) {
  console.log(`[generateEmbedding] Generating embedding for text: "${text}"`);
  const model = await getEmbeddingModel();
  const output = await model(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);
  console.log(`[generateEmbedding] Generated embedding with ${embedding.length} dimensions`);
  console.log(`[generateEmbedding] First 5 values: [${embedding.slice(0, 5).join(', ')}]`);
  return embedding;
}

/**
 * Search for the best matching icon using vector similarity
 * @param {Object} client - Redis client
 * @param {string} statusMessage - The status message to search for
 * @param {string} prefix - User prefix (e.g., 'a', 'b')
 * @returns {Promise<string>} - The best matching icon name
 */
async function searchBestIcon(client, statusMessage, prefix) {
  try {
    console.log(`[searchBestIcon] Starting icon search for message: "${statusMessage}"`);

    if (!statusMessage || statusMessage.trim() === '') {
      console.log(`[searchBestIcon] Empty message, returning default icon`);
      return 'circle'; // Default icon for empty messages
    }

    // Generate embedding for the status message
    const embedding = await generateEmbedding(statusMessage);

    // Perform vector search using redis-dal
    const indexName = `${prefix}_lucide_icon_index`;
    const searchResults = await redis.vectorSearch(client, indexName, embedding, {
      k: 1,
      returnFields: ['name', 'score']  // Field is 'name', not 'icon_name'
    });

    if (searchResults.total > 0 && searchResults.documents.length > 0) {
      const bestMatch = searchResults.documents[0];
      const iconName = bestMatch.value.name;  // Use 'name' field
      console.log(`[searchBestIcon] ✓ Found icon: "${iconName}" for message: "${statusMessage}"`);
      return iconName;
    }

    console.log(`[searchBestIcon] No results found, using default icon`);
    return 'circle'; // Default fallback
  } catch (err) {
    console.error(`[searchBestIcon] ERROR: ${err.message}`);
    return 'circle'; // Fallback on error
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER
// ============================================================================

/**
 * Extract prefix from Redis username.
 * Example: redisboard-a -> a, redisboard-b -> b
 */
function extractPrefix(username) {
  return username.replace(/^redisboard-/, '');
}

/**
 * Get human-readable status text.
 */
function getStatusText(status) {
  switch(status) {
    case 'red': return 'Busy';
    case 'green': return 'Available';
    case 'purple': return 'Away';
    default: return 'Unknown';
  }
}

/**
 * Generate Redis key for a user status.
 * Pattern: status:{prefix}:{username}
 * Example: status:a:redisboard-a
 */
function getUserKey(username, prefix) {
  return `status:${prefix}:${username}`;
}

/**
 * Get all user statuses from Redis using SCAN.
 * Returns array of user objects: { username, status, message, icon }
 * Does NOT include location data - use getUsersOnMap() for that.
 */
async function getAllUsers(client) {
  const results = await redis.scanKeys(client, 'status:*');
  return results.map(item => {
    const parts = item.key.split(':');
    const username = parts.slice(2).join(':');
    const data = item.value || {};
    return {
      username,
      status: data.status || 'green',
      message: data.message || '',
      icon: data.icon || 'circle'
    };
  });
}

/**
 * Get users with locations within Israel using native Redis GEOSHAPE query.
 * All filtering is done at the database level using WKT polygon.
 */
async function getUsersOnMap(client) {
  try {
    const statuses = await redis.searchStatusesWithLocation(client, 'status_index');
    return statuses.filter(s => s.longitude && s.latitude);
  } catch (err) {
    if (err.message && err.message.includes('no such index')) {
      return [];
    }
    throw err;
  }
}

/**
 * Update a user's status in Redis.
 */
async function updateUserStatus(client, username, prefix, statusData) {
  const key = getUserKey(username, prefix);

  // Search for the best matching icon based on the message
  let icon = 'circle'; // Default icon
  if (statusData.message && statusData.message.trim() !== '') {
    icon = await searchBestIcon(client, statusData.message, prefix);
  }

  const value = {
    status: statusData.status,
    message: statusData.message || '',
    icon: icon
  };

  if (statusData.longitude !== undefined && statusData.latitude !== undefined) {
    const longitude = parseFloat(statusData.longitude);
    const latitude = parseFloat(statusData.latitude);
    value.location = `POINT(${longitude} ${latitude})`;
  }

  await redis.setHash(client, key, value);
  return { key, value };
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * POST /api/connect-test
 * Body: { url, username, password }
 * Tests that credentials work (PING) and returns current user status.
 */
app.post('/api/connect-test', async (req, res) => {
  const { url, username, password } = req.body;

  let client;
  try {
    client = await redis.createRedisConnection({ url, username, password });
    const pong = await redis.ping(client);

    // Get current user's status if it exists
    const prefix = extractPrefix(username);
    const key = getUserKey(username, prefix);
    const currentStatus = await redis.getHash(client, key);

    await redis.closeConnection(client);
    res.json({
      ok: true,
      pong,
      currentStatus: currentStatus || { status: 'green', message: '', icon: 'circle' }
    });
  } catch (err) {
    if (client) {
      try { await redis.closeConnection(client); } catch (_) {}
    }
    console.error('connect-test error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/list-users
 * Body: { url, username, password }
 * Returns all user statuses (without location data).
 */
app.post('/api/list-users', async (req, res) => {
  const { url, username, password } = req.body;
  let client;

  try {
    client = await redis.createRedisConnection({ url, username, password });
    const users = await getAllUsers(client);
    await redis.closeConnection(client);

    res.json({ ok: true, users });
  } catch (err) {
    if (client) {
      try { await redis.closeConnection(client); } catch (_) {}
    }
    console.error('list-users error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/users-on-map
 * Body: { url, username, password }
 * Returns users with valid locations in Israel using RediSearch GEO aggregation.
 */
app.post('/api/users-on-map', async (req, res) => {
  const { url, username, password } = req.body;
  let client;

  try {
    client = await redis.createRedisConnection({ url, username, password });
    const users = await getUsersOnMap(client);
    await redis.closeConnection(client);

    res.json({ ok: true, users });
  } catch (err) {
    if (client) {
      try { await redis.closeConnection(client); } catch (_) {}
    }
    console.error('users-on-map error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/update-status
 * Body: { url, username, password, myUsername, status, message, longitude, latitude }
 * Updates a user's status in Redis.
 */
app.post('/api/update-status', async (req, res) => {
  const { url, username, password, myUsername, status, message, longitude, latitude } = req.body;
  let client;



  if (!myUsername || !status) {
    return res.status(400).json({ ok: false, error: 'Missing myUsername or status' });
  }

  const allowedStatuses = ['red', 'green', 'purple'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status value' });
  }

  try {
    client = await redis.createRedisConnection({ url, username, password });
    const prefix = extractPrefix(username);

    const statusData = { status, message: message || '' };
    if (longitude !== undefined && latitude !== undefined) {
      statusData.longitude = longitude;
      statusData.latitude = latitude;
    }

    await updateUserStatus(client, myUsername, prefix, statusData);

    const updateMessage = (longitude !== undefined && latitude !== undefined)
      ? `User ${myUsername} location updated`
      : message
        ? `User ${myUsername} status is ${getStatusText(status)}: ${message}`
        : `User ${myUsername} status is ${getStatusText(status)}`;

    await redis.publish(client, 'updates', updateMessage);
    sendToAllClients({ type: 'update', message: updateMessage });
    await redis.closeConnection(client);

    res.json({ ok: true });
  } catch (err) {
    if (client) {
      try { await redis.closeConnection(client); } catch (_) {}
    }
    console.error('update-status error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/updates
 * Server-Sent Events endpoint for real-time updates
 */
app.get('/api/updates', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Add client to the set
  sseClients.add(res);
  console.log(`[SSE] Client connected. Total clients: ${sseClients.size}`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to updates' })}\n\n`);

  // Remove client on disconnect
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.size}`);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
