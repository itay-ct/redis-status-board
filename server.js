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
 * Pattern: {prefix}:status:{username}
 * Example: a:status:redisboard-a
 */
function getUserKey(username, prefix) {
  return `${prefix}:status:${username}`;
}

/**
 * Parse username from Redis key.
 * Example: a:status:redisboard-a -> redisboard-a
 */
function parseUsernameFromKey(key) {
  const parts = key.split(':');
  return parts.slice(2).join(':'); // Skip prefix and 'status', handle usernames with colons
}

/**
 * Get all user statuses from Redis.
 * Returns array of user objects: { username, status, message }
 * Scans all prefixes: a:status:*, b:status:*, etc.
 */
async function getAllUsers(client) {
  const results = await redis.scanKeys(client, '*:status:*');

  return results.map(item => {
    const username = parseUsernameFromKey(item.key);
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

  console.log(`[updateUserStatus] Attempting to write to key: "${key}"`);
  console.log(`[updateUserStatus] Value: ${JSON.stringify(value)}`);

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
 * Returns all user statuses.
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
 * POST /api/update-status
 * Body: { url, username, password, myUsername, status, message }
 * Updates a user's status in Redis.
 */
app.post('/api/update-status', async (req, res) => {
  const { url, username, password, myUsername, status, message } = req.body;
  let client;

  console.log(`[update-status] Request: username="${username}", myUsername="${myUsername}", status="${status}"`);

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
    console.log(`[update-status] Extracted prefix: "${prefix}" from username: "${username}"`);

    const result = await updateUserStatus(client, myUsername, prefix, {
      status,
      message: message || ''
    });

    console.log(`[update-status] SUCCESS: ${result.key} = ${JSON.stringify(result.value)}`);

    // Publish update to Redis pub/sub
    const statusText = getStatusText(status);
    const updateMessage = message
      ? `User ${myUsername} status is ${statusText}: ${message}`
      : `User ${myUsername} status is ${statusText}`;

    await redis.publish(client, 'updates', updateMessage);
    console.log(`[update-status] Published to 'updates': ${updateMessage}`);

    // Broadcast to all SSE clients
    sendToAllClients({ type: 'update', message: updateMessage });

    await redis.closeConnection(client);
    res.json({ ok: true });
  } catch (err) {
    if (client) {
      try { await redis.closeConnection(client); } catch (_) {}
    }

    const prefix = extractPrefix(username);
    const attemptedKey = getUserKey(myUsername, prefix);
    console.error(`[update-status] ERROR: ${err.message}`);
    console.error(`[update-status] Attempted key: "${attemptedKey}"`);
    console.error(`[update-status] Redis username: "${username}"`);
    console.error(`[update-status] Extracted prefix: "${prefix}"`);
    console.error(`[update-status] Target myUsername: "${myUsername}"`);

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

/**
 * POST /api/debug-vector-search
 * Body: { url, username, password, message }
 * Debug endpoint to generate FT.SEARCH command for RedisInsight
 */
app.post('/api/debug-vector-search', async (req, res) => {
  const { url, username, password, message } = req.body;

  if (!message) {
    return res.status(400).json({ ok: false, error: 'Missing message parameter' });
  }

  let client;
  try {
    client = await redis.createRedisConnection({ url, username, password });
    const prefix = extractPrefix(username);

    // Generate embedding
    const embedding = await generateEmbedding(message);

    // Convert to hex string for RedisInsight
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    const hexString = embeddingBuffer.toString('hex');

    const indexName = `${prefix}_lucide_icon_index`;

    // Generate the exact FT.SEARCH command for RedisInsight
    const redisInsightCommand = `FT.SEARCH ${indexName} "*=>[KNN 1 @embedding $vector AS score]" PARAMS 2 vector "\\x${hexString}" RETURN 2 name score SORTBY score DIALECT 2`;

    await redis.closeConnection(client);

    res.json({
      ok: true,
      message: message,
      prefix: prefix,
      indexName: indexName,
      embeddingDimensions: embedding.length,
      embeddingBufferSize: embeddingBuffer.length,
      embeddingHex: hexString,
      redisInsightCommand: redisInsightCommand,
      instructions: [
        "Copy the 'redisInsightCommand' below",
        "Paste it into RedisInsight CLI or Workbench",
        "This will perform the exact same vector search the server does",
        "Check if the index exists first with: FT.INFO " + indexName
      ]
    });
  } catch (err) {
    if (client) {
      try { await redis.closeConnection(client); } catch (_) {}
    }
    console.error('debug-vector-search error:', err.message);
    res.status(400).json({ ok: false, error: err.message, stack: err.stack });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
