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
 * Set a Redis HASH at a key.
 * Converts object to Redis hash fields using HSET.
 * All values are converted to strings.
 * NOTE: This uses Redis HASHES, NOT RedisJSON.
 */
async function setHash(client, key, value) {
  try {
    // Convert all values to strings for Redis hash
    const stringifiedValue = {};
    for (const [k, v] of Object.entries(value)) {
      stringifiedValue[k] = String(v);
    }

    console.log(`[redis-dal.setHash] Setting key: "${key}"`);
    console.log(`[redis-dal.setHash] Value: ${JSON.stringify(stringifiedValue)}`);

    await client.hSet(key, stringifiedValue);
  } catch (err) {
    console.error(`[redis-dal.setHash] FAILED to set key: "${key}"`);
    console.error(`[redis-dal.setHash] Error: ${err.message}`);
    console.error(`[redis-dal.setHash] Error stack:`, err.stack);
    console.error(`[redis-dal.setHash] Value attempted: ${JSON.stringify(value)}`);
    throw err;
  }
}

/**
 * Get a Redis HASH from a key.
 * Returns object with all hash fields using HGETALL.
 * NOTE: This uses Redis HASHES, NOT RedisJSON.
 */
async function getHash(client, key) {
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
 * NOTE: This uses Redis HASHES (HGETALL), NOT RedisJSON.
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
      const promises = keys.map(key => getHash(client, key).catch(() => null));
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
 * Perform vector similarity search using RediSearch FT.SEARCH.
 * @param {Object} client - Redis client
 * @param {string} indexName - Name of the RediSearch index
 * @param {Array<number>} embedding - Embedding vector (array of floats)
 * @param {Object} options - Search options
 * @param {number} options.k - Number of nearest neighbors to return (default: 1)
 * @param {Array<string>} options.returnFields - Fields to return (default: ['name', 'score'])
 * @returns {Promise<Object>} - Search results
 */
async function vectorSearch(client, indexName, embedding, options = {}) {
  const k = options.k || 1;
  const returnFields = options.returnFields || ['name', 'score'];

  console.log(`[redis-dal.vectorSearch] ========================================`);
  console.log(`[redis-dal.vectorSearch] Starting vector search`);
  console.log(`[redis-dal.vectorSearch] Index: "${indexName}"`);
  console.log(`[redis-dal.vectorSearch] Embedding dimensions: ${embedding.length}`);
  console.log(`[redis-dal.vectorSearch] K (nearest neighbors): ${k}`);

  try {
    // Convert embedding to buffer for Redis
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    console.log(`[redis-dal.vectorSearch] Embedding buffer size: ${embeddingBuffer.length} bytes`);

    // KNN vector search query
    const query = `*=>[KNN ${k} @embedding $vector AS score]`;
    console.log(`[redis-dal.vectorSearch] Query: "${query}"`);

    console.log(`[redis-dal.vectorSearch] Executing FT.SEARCH...`);
    const searchResults = await client.ft.search(
      indexName,
      query,
      {
        PARAMS: {
          vector: embeddingBuffer
        },
        RETURN: returnFields,
        SORTBY: 'score',
        DIALECT: 2
      }
    );

    console.log(`[redis-dal.vectorSearch] Search completed`);
    console.log(`[redis-dal.vectorSearch] Total results: ${searchResults.total}`);
    console.log(`[redis-dal.vectorSearch] Documents returned: ${searchResults.documents.length}`);

    if (searchResults.documents.length > 0) {
      console.log(`[redis-dal.vectorSearch] Best match:`, JSON.stringify(searchResults.documents[0], null, 2));
    }

    console.log(`[redis-dal.vectorSearch] ========================================`);

    return searchResults;
  } catch (err) {
    console.error(`[redis-dal.vectorSearch] ========================================`);
    console.error(`[redis-dal.vectorSearch] ERROR occurred during search`);
    console.error(`[redis-dal.vectorSearch] Error type: ${err.constructor.name}`);
    console.error(`[redis-dal.vectorSearch] Error message: ${err.message}`);
    console.error(`[redis-dal.vectorSearch] Error stack:`, err.stack);
    console.error(`[redis-dal.vectorSearch] ========================================`);
    throw err;
  }
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
  setHash,
  getHash,
  deleteKey,
  scanKeys,
  ping,
  publish,
  vectorSearch,
  closeConnection
};

