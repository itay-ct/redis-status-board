const { createClient } = require('redis');
const fs = require('fs');

//==============================================================================
// STEP 1 - Connecting to Redis
//==============================================================================

let client = null;

async function connect({ url, username, password }) {
// TODO
}

async function disconnect() {
// TODO
}

async function ping() {
// TODO
}

//==============================================================================
// STEP 2 - Setting the user status
//==============================================================================

async function updateStatus(username, prefix, statusData) {
// TODO
}

async function getStatus(username, prefix) {
// TODO
}

//==============================================================================
// STEP 3 - Getting all the statuses
//==============================================================================

async function getAllStatuses() {
// TODO
}

//==============================================================================
// STEP 4 - PUB/SUB for updates
//==============================================================================

let subscriberClient = null;

async function publish(channel, message) {
// TODO
}

async function subscribe(channel, messageHandler) {
// TODO
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

    // TODO
  } catch (err) {
    console.error('Icon search failed:', err.message);
  }

  return DEFAULT_ICON;
}

//==============================================================================
// STEP 6 - MAP SEARCH
//==============================================================================

function geojsonToWKT(geojsonPath) {
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const coords = geojson.features[0].geometry.coordinates[0];
  const wktCoords = coords.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
  return `POLYGON((${wktCoords}))`;
}

async function getStatusesWithLocation() {
  try {
    const israelWKT = geojsonToWKT('FILENAME_PATH');
    // TODO
  } catch (err) {
  // TODO
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
