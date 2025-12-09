const express = require('express');
const cors = require('cors');
const path = require('path');
const redis = require('./redis-dal');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Set();
const subscribers = new Map();

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

    const prefix = extractPrefix(username);
    const key = `status:${prefix}:${username}`;
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
    const users = await redis.getAllStatuses(client);
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
 * Returns users with valid locations in Israel using Redis Query Engine GEO aggregation.
 */
app.post('/api/users-on-map', async (req, res) => {
  const { url, username, password } = req.body;
  let client;

  try {
    client = await redis.createRedisConnection({ url, username, password });
    const users = await redis.getStatusesWithLocation(client);
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

    await redis.updateStatus(client, myUsername, prefix, statusData);

    const updateMessage = (longitude !== undefined && latitude !== undefined)
      ? `User ${myUsername} location updated`
      : message
        ? `User ${myUsername} status is ${getStatusText(status)}: ${message}`
        : `User ${myUsername} status is ${getStatusText(status)}`;

    await redis.publish(client, 'updates', updateMessage);
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
 * Query params: url, username, password
 */
app.get('/api/updates', async (req, res) => {
  const { url, username, password } = req.query;

  if (!url || !username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing Redis credentials' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.add(res);
  console.log(`[SSE] Client connected. Total clients: ${sseClients.size}`);

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to updates' })}\n\n`);

  let subscriberClient = null;

  try {
    subscriberClient = await redis.createRedisConnection({ url, username, password });

    await redis.subscribe(subscriberClient, 'updates', (message) => {
      res.write(`data: ${JSON.stringify({ type: 'update', message })}\n\n`);
    });

    subscribers.set(res, subscriberClient);
    console.log(`[Redis Pub/Sub] Subscribed to updates`);
  } catch (err) {
    console.error('[Redis Pub/Sub] Subscription failed:', err.message);
    sseClients.delete(res);
    if (subscriberClient) {
      await redis.closeConnection(subscriberClient);
    }
    return res.status(500).json({ ok: false, error: err.message });
  }

  req.on('close', async () => {
    sseClients.delete(res);
    const client = subscribers.get(res);
    if (client) {
      subscribers.delete(res);
      await redis.closeConnection(client);
    }
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.size}`);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
