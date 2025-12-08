const { createClient } = require('redis');
const fs = require('fs');

async function createRedisConnection({ url, username, password }) {
  const client = createClient({ url, username, password });
  client.on('error', (err) => console.error('Redis Error', err));
  await client.connect();
  return client;
}

async function setHash(client, key, value) {
  const stringified = {};
  for (const [k, v] of Object.entries(value)) {
    stringified[k] = String(v);
  }
  await client.hSet(key, stringified);
}

async function getHash(client, key) {
  const hash = await client.hGetAll(key);
  return Object.keys(hash).length > 0 ? hash : null;
}

async function scanKeys(client, pattern) {
  const results = [];
  let cursor = 0;

  do {
    const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 1000 });
    cursor = reply.cursor;

    for (const key of reply.keys) {
      const value = await getHash(client, key);
      results.push({ key, value });
    }
  } while (cursor !== 0);

  return results;
}

async function ping(client) {
  return await client.ping();
}

async function publish(client, channel, message) {
  await client.publish(channel, message);
}

function geojsonToWKT(geojsonPath) {
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const coords = geojson.features[0].geometry.coordinates[0];
  const wktCoords = coords.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
  return `POLYGON((${wktCoords}))`;
}

async function searchStatusesWithLocation(client, indexName) {
  const israelWKT = geojsonToWKT('./il.json');
  const searchResults = await client.ft.search(
    indexName,
    '@location:[WITHIN $shape]',
    {
      PARAMS: { shape: israelWKT },
      RETURN: ['status', 'message', 'icon', 'location'],
      LIMIT: { from: 0, size: 10000 },
      DIALECT: 3
    }
  );

  return searchResults.documents.map(doc => {
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
  });
}

async function vectorSearch(client, indexName, embedding, options = {}) {
  const k = options.k || 1;
  const returnFields = options.returnFields || ['name', 'score'];
  const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
  
  return await client.ft.search(
    indexName,
    `*=>[KNN ${k} @embedding $vector AS score]`,
    {
      PARAMS: { vector: embeddingBuffer },
      RETURN: returnFields,
      SORTBY: 'score',
      DIALECT: 2
    }
  );
}

async function closeConnection(client) {
  await client.quit();
}

module.exports = {
  createRedisConnection,
  setHash,
  getHash,
  scanKeys,
  ping,
  publish,
  searchStatusesWithLocation,
  vectorSearch,
  closeConnection
};
