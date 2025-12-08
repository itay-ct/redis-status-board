const { createClient } = require('redis');

// ============================================================================
// Redis Data Access Layer
// Uses Redis HASHES for storing structured data (not RedisJSON)
// ============================================================================

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Create a Redis client connection.
 */
async function createRedisConnection({ url, username, password }) {
  if (!url || !username || !password) {
    throw new Error('Missing Redis connection details');
  }

  const client = createClient({
    url,
    username,
    password
  });

  client.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  await client.connect();
  return client;
}

// ============================================================================
// CORE REDIS OPERATIONS
// ============================================================================

/**
 * Set a hash value at a key.
 * Converts object to Redis hash fields.
 */
async function setJSON(client, key, value) {
  try {
    await client.hSet(key, value);
  } catch (err) {
    console.error(`[redis-dal.setJSON] FAILED to set key: "${key}"`);
    console.error(`[redis-dal.setJSON] Error: ${err.message}`);
    console.error(`[redis-dal.setJSON] Value attempted: ${JSON.stringify(value)}`);
    throw err;
  }
}

/**
 * Get a hash value from a key.
 * Returns object with all hash fields.
 */
async function getJSON(client, key) {
  const hash = await client.hGetAll(key);
  // Return null if hash is empty (key doesn't exist)
  return Object.keys(hash).length > 0 ? hash : null;
}

/**
 * Delete a key.
 */
async function deleteKey(client, key) {
  const result = await client.del(key);
  return result > 0;
}

/**
 * Scan all keys matching a pattern and return their hash values.
 * Returns array of objects: { key, value }
 */
async function scanKeys(client, pattern) {
  const results = [];
  let cursor = 0;

  do {
    const reply = await client.scan(cursor, {
      MATCH: pattern,
      COUNT: 1000
    });

    cursor = reply.cursor;
    const keys = reply.keys;

    if (keys.length > 0) {
      const promises = keys.map(key => getJSON(client, key).catch(() => null));
      const values = await Promise.all(promises);

      keys.forEach((key, idx) => {
        results.push({
          key,
          value: values[idx]
        });
      });
    }
  } while (cursor !== 0);

  return results;
}

/**
 * Test connection with PING.
 */
async function ping(client) {
  return await client.ping();
}

/**
 * Publish a message to a Redis pub/sub channel.
 */
async function publish(client, channel, message) {
  await client.publish(channel, message);
}

/**
 * Close connection.
 */
async function closeConnection(client) {
  await client.quit();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  createRedisConnection,
  setJSON,
  getJSON,
  deleteKey,
  scanKeys,
  ping,
  publish,
  closeConnection
};

