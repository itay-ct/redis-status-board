const { createClient } = require('redis');
const fs = require('fs');

//==============================================================================
// STEP 1 - Connecting to Redis
//==============================================================================

let client = null;

async function connect({ url, username, password }) {
  client = createClient({ url, username, password });
  client.on('error', (err) => console.error('Redis Error', err));
  await client.connect();
}

async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
  }
}

async function ping() {
  return await client.ping();
}

//==============================================================================
// STEP 2 - Setting the user status
//==============================================================================

async function updateStatus(username, prefix, statusData) {
  const key = `status:${prefix}:${username}`;

  const value = {
    status: statusData.status,
    message: statusData.message || ''
  };

  if (statusData.message && statusData.message.trim()) {
    const icon = await searchBestIcon(statusData.message, prefix);
    if (icon) {
      value.icon = icon;
    }
  }

  if (statusData.longitude && statusData.latitude) {
    value.location = `POINT(${statusData.longitude} ${statusData.latitude})`;
  }

  await client.hSet(key, value);
}

async function getStatus(username, prefix) {
  const key = `status:${prefix}:${username}`;
  const hash = await client.hGetAll(key);

  if (!hash || Object.keys(hash).length === 0) {
    return null;
  }

  return {
    status: hash.status || 'green',
    message: hash.message || '',
    icon: hash.icon || DEFAULT_ICON
  };
}

//==============================================================================
// STEP 3 - Getting all the statuses
//==============================================================================

async function getAllStatuses() {
  const results = [];

  for await (const key of client.scanIterator({ MATCH: 'status:*', COUNT: 1000 })) {
    const hash = await client.hGetAll(key);
    const username = key.split(':').slice(2).join(':');
    results.push({
      username,
      status: hash.status || 'green',
      message: hash.message || '',
      icon: hash.icon || DEFAULT_ICON
    });
  }

  return results;
}

//==============================================================================
// STEP 4 - PUB/SUB for updates
//==============================================================================

let subscriberClient = null;

async function publish(channel, message) {
  await client.publish(channel, message);
}

async function subscribe(channel, messageHandler) {
  if (!subscriberClient) {
    subscriberClient = client.duplicate();
    subscriberClient.on('error', (err) => console.error('Redis Subscriber Error', err));
    await subscriberClient.connect();
  }

  await subscriberClient.subscribe(channel, messageHandler);
}

//==============================================================================
// STEP 5 - ICON USING VECTOR SEARCH
//==============================================================================

const DEFAULT_ICON = 'circle';
let embeddingModel = null;

async function searchBestIcon(statusMessage, prefix) {
  if (!statusMessage || !statusMessage.trim()) {
    return DEFAULT_ICON;
  }

  try {
    if (!embeddingModel) {
      const { pipeline } = await import('@xenova/transformers');
      embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    const output = await embeddingModel(statusMessage, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    const searchResults = await client.ft.search(
      `${prefix}_lucide_icon_index`,
      `*=>[KNN 1 @embedding $vector AS score]`,
      {
        PARAMS: { vector: embeddingBuffer },
        RETURN: ['name', 'score'],
        SORTBY: 'score',
        DIALECT: 2
      }
    );

    if (searchResults.total > 0 && searchResults.documents.length > 0) {
      return searchResults.documents[0].value.name;
    }
  } catch (err) {
    console.error('Icon search failed:', err.message);
  }

  return DEFAULT_ICON;
}

//==============================================================================
// STEP 6 - MAP SEARCH
//==============================================================================

async function getStatusesWithLocation(prefix) {
  try {
    const geojson = JSON.parse(fs.readFileSync('./il.json', 'utf8'));
    const coords = geojson.features[0].geometry.coordinates[0];
    const wktCoords = coords.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
    const israelWKT = `POLYGON((${wktCoords}))`;
    
    const searchResults = await client.ft.search(
      `${prefix}_status_index`,
      '@location:[WITHIN $shape]',
      {
        PARAMS: { shape: israelWKT },
        RETURN: ['status', 'message', 'icon', 'location'],
        LIMIT: { from: 0, size: 10000 },
        DIALECT: 2
      }
    );

    return searchResults.documents.map(doc => {
      const result = {
        key: doc.id,
        username: doc.id.split(':').slice(2).join(':'),
        status: doc.value.status || 'green',
        message: doc.value.message || '',
        icon: doc.value.icon || DEFAULT_ICON
      };

      if (doc.value.location) {
        const match = doc.value.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        if (match) {
          result.longitude = parseFloat(match[1]);
          result.latitude = parseFloat(match[2]);
        }
      }

      return result;
    });
  } catch (err) {
    if (err.message && err.message.includes('no such index')) {
      return [];
    }
    throw err;
  }
}

module.exports = {
  connect,
  disconnect,
  ping,
  updateStatus,
  getStatus,
  getAllStatuses,
  publish,
  subscribe,
  getStatusesWithLocation
};
