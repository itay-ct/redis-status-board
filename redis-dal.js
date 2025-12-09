const { createClient } = require('redis');
const { pipeline } = require('@xenova/transformers');
const fs = require('fs');

async function createRedisConnection({ url, username, password }) {
  const client = createClient({ url, username, password });
  client.on('error', (err) => console.error('Redis Error', err));
  await client.connect();
  return client;
}

async function ping(client) {
  return await client.ping();
}

async function publish(client, channel, message) {
  await client.publish(channel, message);
}

async function subscribe(client, channel, messageHandler) {
  await client.subscribe(channel, messageHandler);
}

async function getHash(client, key) {
  const hash = await client.hGetAll(key);
  return Object.keys(hash).length > 0 ? hash : null;
}

async function updateStatus(client, username, prefix, statusData) {
  const key = `status:${prefix}:${username}`;

  let icon = 'circle';
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

  const stringified = {};
  for (const [k, v] of Object.entries(value)) {
    stringified[k] = String(v);
  }
  await client.hSet(key, stringified);
}

async function getAllStatuses(client) {
  const results = [];
  let cursor = 0;

  do {
    const reply = await client.scan(cursor, { MATCH: 'status:*', COUNT: 1000 });
    cursor = reply.cursor;

    for (const key of reply.keys) {
      const value = await getHash(client, key);
      const parts = key.split(':');
      const username = parts.slice(2).join(':');
      results.push({
        username,
        status: value?.status || 'green',
        message: value?.message || '',
        icon: value?.icon || 'circle'
      });
    }
  } while (cursor !== 0);

  return results;
}

function geojsonToWKT(geojsonPath) {
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const coords = geojson.features[0].geometry.coordinates[0];
  const wktCoords = coords.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
  return `POLYGON((${wktCoords}))`;
}

async function getStatusesWithLocation(client) {
  try {
    const israelWKT = geojsonToWKT('./il.json');
    const searchResults = await client.ft.search(
      'status_index',
      '@location:[WITHIN $shape]',
      {
        PARAMS: { shape: israelWKT },
        RETURN: ['status', 'message', 'icon', 'location'],
        LIMIT: { from: 0, size: 10000 },
        DIALECT: 3
      }
    );

    return searchResults.documents
      .map(doc => {
        const match = doc.value.location?.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        const [lon, lat] = match ? [parseFloat(match[1]), parseFloat(match[2])] : [];
        return {
          key: doc.id,
          username: doc.id.split(':').slice(2).join(':'),
          status: doc.value.status || 'green',
          message: doc.value.message || '',
          icon: doc.value.icon || 'circle',
          ...(lon && lat && { longitude: lon, latitude: lat })
        };
      })
      .filter(s => s.longitude && s.latitude);
  } catch (err) {
    if (err.message && err.message.includes('no such index')) {
      return [];
    }
    throw err;
  }
}

let embeddingModel = null;

async function searchBestIcon(client, statusMessage, prefix) {
  try {
    if (!statusMessage || statusMessage.trim() === '') {
      return 'circle';
    }

    if (!embeddingModel) {
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

    return 'circle';
  } catch (err) {
    return 'circle';
  }
}

async function closeConnection(client) {
  await client.quit();
}

module.exports = {
  createRedisConnection,
  getHash,
  updateStatus,
  getAllStatuses,
  getStatusesWithLocation,
  ping,
  publish,
  subscribe,
  closeConnection
};
