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
let cachedPrefix = null; // Cache the prefix globally

// ============================================================================
// BUSINESS LOGIC LAYER
// ============================================================================

/**
 * Extract prefix from Redis username.
 * Example: redisboard-a -> a, redisboard-b -> b
 */
function extractPrefix(username) {
  const prefix = username.replace(/^redisboard-/, '');
  cachedPrefix = prefix; // Cache it globally
  return prefix;
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
 * Tests that credentials work (PING) and initializes the Redis connection.
 */
app.post('/api/connect-test', async (req, res) => {
  const { url, username, password } = req.body;

  try {
    await redis.connect({ url, username, password });

    const pong = await redis.ping();
    if (!pong || pong !== 'PONG') {
      throw new Error('Connection failed: PING did not return PONG');
    }

    const prefix = extractPrefix(username);
    const myUsername = username;

    const currentStatus = await redis.getStatus(myUsername, prefix);

    await redis.subscribe('updates', (message) => {
      sseClients.forEach(client => {
        client.write(`data: ${JSON.stringify({ type: 'update', message })}\n\n`);
      });
    });

    res.json({
      ok: true,
      pong,
      prefix,
      myUsername,
      currentStatus
    });
  } catch (err) {
    console.error('connect-test error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/list-users
 * Returns all user statuses (without location data).
 */
app.post('/api/list-users', async (req, res) => {
  try {
    const users = await redis.getAllStatuses();
    res.json({ ok: true, users });
  } catch (err) {
    console.error('list-users error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/users-on-map
 * Returns users with valid locations in the country using Redis Query Engine GEO aggregation.
 */
app.post('/api/users-on-map', async (req, res) => {
  try {
    if (!cachedPrefix) {
      return res.status(400).json({ ok: false, error: 'No connection established. Connect first.' });
    }

    const usersWithLocation = await redis.getStatusesWithLocation(cachedPrefix);
    res.json({ ok: true, users: usersWithLocation });
  } catch (err) {
    console.error('users-on-map error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/update-status
 * Body: { myUsername, prefix, status, message, longitude, latitude }
 * Updates a user's status in Redis.
 */
app.post('/api/update-status', async (req, res) => {
  const { myUsername, prefix, status, message, longitude, latitude } = req.body;

  if (!myUsername || !status) {
    return res.status(400).json({ ok: false, error: 'Missing myUsername or status' });
  }

  const allowedStatuses = ['red', 'green', 'purple'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status value' });
  }

  try {
    const statusData = { status, message: message || '' };
    if (longitude !== undefined && latitude !== undefined) {
      statusData.longitude = longitude;
      statusData.latitude = latitude;
    }

    await redis.updateStatus(myUsername, prefix, statusData);

    const updateMessage = (longitude !== undefined && latitude !== undefined)
      ? `User ${myUsername} location updated`
      : message
        ? `User ${myUsername} status is ${getStatusText(status)}: ${message}`
        : `User ${myUsername} status is ${getStatusText(status)}`;

    await redis.publish('updates', updateMessage);

    res.json({ ok: true });
  } catch (err) {
    console.error('update-status error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/updates
 * Server-Sent Events endpoint for real-time updates
 */
app.get('/api/updates', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.add(res);
  console.log(`[SSE] Client connected. Total clients: ${sseClients.size}`);

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to updates' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.size}`);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
