# Redis Status Board Workshop

Welcome to the Redis Status Board Workshop! 🎉

In this hands-on workshop, you'll build a **real-time team status dashboard** where users can:
- Set their availability status (Available, Busy, Away)
- Share custom status messages with AI-powered icons
- Pin their location on a map
- See live updates from all participants in real-time

<details open>
<summary><h2 style="display: inline;">Workshop Overview</h2></summary>

All participants share a **single Redis cluster** (connection details will be provided). Each participant gets their own username and password to connect.

### Understanding Your Redis Namespace

Redis uses a **key-value** structure. To prevent conflicts between users, each participant has their own namespace:

- **User prefix**: If your username is `redisboard-a`, your prefix is `a`
- **Personal keys**: `a:*` - You can write anything here (e.g., `a:lucide:icon:coffee`)
- **Status keys**: `status:a:*` - Your status data lives here (e.g., `status:a:redisboard-a`)

### Access Control (ACL)

Each user has been configured with granular permissions:

```
+@read +@write +@connection +PUBLISH +SUBSCRIBE +FT.SEARCH +FT._LIST +FT.INFO +FT.CREATE -@dangerous %R~* %W~a:* %W~status:a:*
```

The important part: **`%R~* %W~a:* %W~status:a:*`**
- `%R~*` - You can **read** from any key
- `%W~a:*` - You can **write** to keys starting with `a:`
- `%W~status:a:*` - You can **write** to status keys like `status:a:*`

### Getting Started

**Prerequisites:**
- Node.js 18+ installed
- A code editor (VS Code recommended)
- [RedisInsight](https://redis.io/insight/) (optional but highly recommended for visualizing data)

**Setup:**
1. Clone the repository
2. Run `npm install`
3. Run `npm start` to start the server
4. Open `http://localhost:3000` in your browser

### Project Structure

```
├── public/
│   └── index.html          # Frontend UI (don't modify)
├── server.js               # Backend API layer (don't modify)
├── redis-dal.js            # Data Access Layer (YOU WILL WORK HERE!)
└── package.json
```

**Important:** You'll only be editing `redis-dal.js` in this workshop. The frontend and backend are already complete!

### About the Redis Client

We're using the official [`redis`](https://www.npmjs.com/package/redis) npm package (v4.x) which provides a native Node.js interface to Redis commands.

</details>

---

<details>
<summary><h2 style="display: inline;">Step 1: Connect to Redis</h2></summary>

### Introduction

Before we can do anything with Redis, we need to establish a connection. In this step, you'll implement the `connect()` and `ping()` functions to:
- Create a Redis client with your credentials
- Test the connection with a PING command
- Handle connection errors gracefully

**Concepts:**
- **Redis Client**: A connection object that communicates with the Redis server
- **PING**: A simple command that returns "PONG" if the connection is alive

### Task Details

Open `redis-dal.js` and locate the **STEP 1** section. You'll implement two functions:

#### 1. `connect({ url, username, password })`

This function should:
1. Create a Redis client using `createClient()` (already imported)
2. Set up an error handler
3. Connect to Redis

**Reference:** [Redis Node.js Connection Guide](https://redis.io/docs/latest/develop/clients/nodejs/connect/#basic-connection)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function connect({ url, username, password }) {
  client = createClient({ url, username, password });
  client.on('error', (err) => console.error('Redis Error', err));
  await client.connect();
}
```

</details>

#### 2. `ping()`

This function should:
1. Call the `PING` command on the client
2. Return the result (should be "PONG")

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function ping() {
  return await client.ping();
}
```

</details>

### Desired Output

✅ After implementing these functions:
1. Open the web UI at `http://localhost:3000`
2. Enter your Redis credentials (url, username, password)
3. Click "Connect"
4. You should see: **"✅ Connected! PONG received"**
5. The UI should show your username and the status controls

### Notes

- **Credential Caching**: Your credentials are automatically cached in localStorage, so you won't need to re-enter them on page refresh! To change them, click the "Logout" button.
- **Map Visibility**: If the map appears on the right side and you find it distracting, click the collapse button (◀). This preference is also cached.

</details>

---

<details>
<summary><h2 style="display: inline;">Step 2: Store and Retrieve User Status</h2></summary>

### Introduction

Now that we're connected, let's store some data! In this step, you'll implement functions to save and retrieve a user's status using Redis **Hashes**.

**What are Redis Hashes?**
Think of a Hash like a mini key-value store inside a single Redis key. Perfect for storing objects!

Example:
```
Key: status:a:redisboard-a
Hash Fields:
  status → "green"
  message → "Working on the workshop"
```

**Why Hashes?**
- Store multiple fields under one key
- Update individual fields without rewriting everything
- Efficient memory usage
- Native support in Redis

### Task Details

Locate **STEP 2** in `redis-dal.js`. You'll implement two functions:

#### 1. `updateStatus(username, prefix, statusData)`

This function should:
1. Build the key name: `status:${prefix}:${username}`
2. Create a hash object with `status` and `message` fields
3. Use `HSET` to save the hash to Redis

**Redis Command:** [`HSET`](https://redis.io/docs/latest/commands/hset/)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function updateStatus(username, prefix, statusData) {
  const key = `status:${prefix}:${username}`;
  const value = {
    status: statusData.status,
    message: statusData.message || ''
  };
  await client.hSet(key, value);
}
```

</details>

**Important:** For now, create **only ONE key** - your own status key. Don't worry about icons or locations yet!

#### 2. `getStatus(username, prefix)`

This function should:
1. Build the key name: `status:${prefix}:${username}`
2. Use `HGETALL` to retrieve all fields from the hash
3. Return an object with `status`, `message`, and `icon` (or `null` if key doesn't exist)

**Redis Command:** [`HGETALL`](https://redis.io/docs/latest/commands/hgetall/)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function getStatus(username, prefix) {
  const key = `status:${prefix}:${username}`;
  const hash = await client.hGetAll(key);

  if (!hash || Object.keys(hash).length === 0) {
    return null;
  }

  return {
    status: hash.status || 'green',
    message: hash.message || '',
    icon: hash.icon || 'circle'
  };
}
```

</details>

### Desired Output

✅ After implementing these functions:
1. In the web UI, select a status (Available/Busy/Away)
2. Type a message like "Working on Redis workshop"
3. Click "Update Status"
4. Open **RedisInsight** and connect with your credentials
5. You should see your key: `status:a:redisboard-a` (replace `a` with your prefix)
6. Click on the key to see the hash fields:
   - `status`: `green` (or `red`/`purple`)
   - `message`: `Working on Redis workshop`

**Try it:** Change your status or message in the UI and watch the hash update in RedisInsight!

### Notes

- **Key Naming Convention**: Always use `status:{prefix}:{username}` format
- **Default Values**: If a field is missing, provide sensible defaults (`green` for status, empty string for message)
- **Hash vs String**: We use Hashes instead of JSON strings because they're more efficient and allow partial updates

</details>

---

<details>
<summary><h2 style="display: inline;">Step 3: List All Users</h2></summary>

### Introduction

Right now, you can only see your own status. But this is a **team** status board! In this step, you'll implement `getAllStatuses()` to fetch and display all users' statuses.

**The Challenge:**
How do we find all status keys when we don't know all the usernames?

**The Solution: SCAN**

`SCAN` is a cursor-based iterator that lets you traverse all keys matching a pattern without blocking Redis.

**Why not KEYS?**
- `KEYS *` blocks Redis until it scans the entire keyspace (dangerous in production!)
- `SCAN` works incrementally and doesn't block other operations

**Note:** SCAN is fine for this workshop, but in production you'd use **Redis Query Engine** (which we'll explore in Step 6!) for much better performance.

### Task Details

Locate **STEP 3** in `redis-dal.js`. Implement:

#### `getAllStatuses()`

This function should:
1. Use `scanIterator` to find all keys matching `status:*`
2. For each key, fetch the hash with `HGETALL`
3. Extract the username from the key
4. Return an array of user objects

**Reference:** [SCAN Iterator Documentation](https://github.com/redis/node-redis?tab=readme-ov-file#scan-iterator)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function getAllStatuses() {
  const results = [];

  for await (const key of client.scanIterator({ MATCH: 'status:*', COUNT: 1000 })) {
    const hash = await client.hGetAll(key);
    const username = key.split(':').slice(2).join(':');
    results.push({
      username,
      status: hash.status || 'green',
      message: hash.message || '',
      icon: hash.icon || 'circle'
    });
  }

  return results;
}
```

</details>

**How it works:**
- `scanIterator()` returns an async iterator
- `MATCH: 'status:*'` filters keys starting with `status:`
- `COUNT: 1000` is a hint for batch size (not a limit!)
- We extract the username by splitting the key: `status:a:redisboard-a` → `redisboard-a`

### Desired Output

✅ After implementing this function:
1. Refresh the web UI
2. You should see a table with **all participants** and their statuses
3. Ask a friend to update their status
4. Refresh your page - you should see their update!

**What you'll see:**
- Username column
- Status indicator (🟢 Available, 🔴 Busy, 🟣 Away)
- Status message
- Icon (just a circle for now)

### Notes

- **Performance**: SCAN is O(N) where N is the total number of keys. For thousands of users, consider using Redis Query Engine instead.
- **Cursor-based**: SCAN doesn't guarantee to return all keys in one call - it may take multiple iterations.
- **No Duplicates Guarantee**: SCAN may return the same key multiple times if the keyspace changes during iteration.

</details>

---

<details>
<summary><h2 style="display: inline;">Step 4: Real-Time Updates with Pub/Sub</h2></summary>

### Introduction

**Notice something annoying?** You have to refresh the page to see other users' status updates! 😤

Let's fix that with **Redis Pub/Sub** - a messaging pattern where publishers send messages to channels, and subscribers receive them in real-time.

**How it works:**
1. When a user updates their status, we **publish** a message to the `updates` channel
2. All connected clients **subscribe** to the `updates` channel
3. When a message arrives, the UI automatically refreshes and shows a notification

**Server-Sent Events (SSE):**
The backend uses SSE to push updates from Redis to the browser. You don't need to implement SSE - it's already done in `server.js`!

**Important Design Note:**
A Redis client in subscribe mode can **only** execute pub/sub commands (`SUBSCRIBE`, `UNSUBSCRIBE`, `PUBLISH`, etc.). It cannot run regular commands like `HSET` or `SCAN`.

**Solution:** We'll maintain **two Redis clients**:
- **Main client**: For regular commands (HSET, HGETALL, SCAN, etc.)
- **Subscriber client**: Dedicated to pub/sub (SUBSCRIBE only)

### Task Details

Locate **STEP 4** in `redis-dal.js`. You'll implement two functions:

#### 1. `publish(channel, message)`

This function should:
1. Use the main `client` to publish a message to a channel

**Redis Command:** [`PUBLISH`](https://redis.io/docs/latest/commands/publish/)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function publish(channel, message) {
  await client.publish(channel, message);
}
```

</details>

#### 2. `subscribe(channel, messageHandler)`

This function should:
1. Create a **subscriber client** using `client.duplicate()` (only on first call)
2. Connect the subscriber client
3. Subscribe to the channel with the message handler

**Reference:** [Redis Node.js Pub/Sub Guide](https://github.com/redis/node-redis/blob/master/docs/pub-sub.md)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
let subscriberClient = null;

async function subscribe(channel, messageHandler) {
  if (!subscriberClient) {
    subscriberClient = client.duplicate();
    subscriberClient.on('error', (err) => console.error('Redis Subscriber Error', err));
    await subscriberClient.connect();
  }

  await subscriberClient.subscribe(channel, messageHandler);
}
```

</details>

**Why `client.duplicate()`?**
It creates a new client with the same connection settings (url, username, password) - super convenient!

**Note:** There's also a "sharded" pub/sub variant, but we don't need it for this workshop.

### Desired Output

✅ After implementing these functions:
1. Keep your browser open with the status board
2. Ask a friend to update their status
3. **Without refreshing**, you should see:
   - A notification popup in the bottom-right corner
   - The user table automatically updates
   - The notification shows the status change with a colored border (🟢 green for Available, 🔴 red for Busy, 🟣 purple for Away)

**Try it yourself:**
1. Update your own status
2. Watch the notification appear
3. Check that other connected users see your update instantly!

### Notes

- **Channel Name**: We use a single shared channel called `updates` for all users
- **Message Format**: The server publishes plain text messages like `"User redisboard-a status is Available: Ready to help!"`
- **Subscriber Lifecycle**: The subscriber client is created once and reused for all subscriptions
- **Error Handling**: Always add error handlers to both clients to avoid crashes

</details>

---

<details>
<summary><h2 style="display: inline;">Step 5: AI-Powered Icons with Vector Search</h2></summary>

### Introduction

Wouldn't it be cool if your status message automatically got a matching icon? 🎨

For example:
- "Grabbing coffee ☕" → coffee icon
- "In a meeting 📅" → calendar icon
- "Coding 💻" → laptop icon

In this step, you'll use **Redis Vector Search** to find the best icon for any status message using AI embeddings!

**What are Vector Embeddings?**
Embeddings are numerical representations of text that capture semantic meaning. Similar phrases have similar embeddings, even if they use different words.

Example:
- "coffee break" and "grabbing a latte" have similar embeddings
- Both would match the ☕ coffee icon

**How Vector Search Works:**
1. Convert text to a vector (array of numbers) using an AI model
2. Store vectors in Redis with metadata (icon name)
3. Query: "Find the icon whose description is most similar to my status message"
4. Redis uses K-Nearest Neighbors (KNN) to find the closest match

**Embedding Model:**
We'll use the [**Xenova/all-MiniLM-L6-v2**](https://huggingface.co/Xenova/all-MiniLM-L6-v2) model - a lightweight, fast sentence transformer that:
- Generates 384-dimensional embeddings
- Runs efficiently in both Python and Node.js (via Transformers.js)
- Produces high-quality semantic representations for short text

### Task Details

This step has **two parts**: Loading icon data, then implementing the search.

#### Part A: Load Icon Vectors into Redis

We'll use a **Python notebook** to generate embeddings and load them into Redis. Don't worry - you don't need Python installed! We'll use Google Colab.

**Steps:**

1. **Open the notebook:** [Icon Loader Notebook](https://colab.research.google.com/github/itay-ct/IconLoader/blob/main/IconLoader.ipynb)

2. **⛔ CRITICAL: Modify Step 1 BEFORE running anything!**

   In the first code cell, change the index name and key prefix to include **your prefix**:

   ```python
   # If your username is redisboard-a, use prefix 'a'
   INDEX_NAME = "a_lucide_icon_index"
   KEY_PREFIX = "a:lucide:icon:"
   ```

   **Why?** This prevents collisions with other participants. Each user needs their own icon index!

3. **Run Step 1:** Click the play button on the first cell

4. **Enter your Redis connection string** when prompted (Step 2):
   ```
   redis://<username>:<password>@<host>:<port>
   ```

5. **Optional - Customize icons (Step 4):**
   - You can use any icon from the [Lucide icon library](https://lucide.dev/icons/) (1000+ icons available!)
   - Download the [default icon set](https://raw.githubusercontent.com/itay-ct/IconLoader/refs/heads/main/icons.txt) and modify it with your preferred icons
   - Upload your customized `icons.txt` file when prompted in Step 4 of the notebook
   - Or just click "Cancel" to use the default icon set

6. **Run all remaining cells** to load the icons

7. **Verify in RedisInsight:**
   - You should see keys like `a:lucide:icon:coffee`, `a:lucide:icon:calendar`, etc.
   - Each key is a hash with fields: `name`, `description`, `embedding`

#### Part B: Implement Vector Search in Node.js

Now let's use this data! Locate **STEP 5** in `redis-dal.js`.

You'll implement `searchBestIcon(statusMessage, prefix)`:

**Algorithm:**
1. If the message is empty, return default icon (`'circle'`)
2. Load the embedding model (Xenova/all-MiniLM-L6-v2)
3. Generate an embedding vector for the status message
4. Query Redis using `FT.SEARCH` with KNN
5. Return the top matching icon name

**Reference:** [Redis Vector Search - KNN](https://redis.io/docs/latest/develop/ai/search-and-query/query/vector-search/#k-neareast-neighbours-knn)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
const DEFAULT_ICON = 'circle';
let embeddingModel = null;

async function searchBestIcon(statusMessage, prefix) {
  if (!statusMessage || !statusMessage.trim()) {
    return DEFAULT_ICON;
  }

  try {
    // Load model once
    if (!embeddingModel) {
      embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    // Generate embedding
    const output = await embeddingModel(statusMessage, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    // Search Redis
    const results = await client.ft.search(
      `${prefix}_lucide_icon_index`,
      `*=>[KNN 1 @embedding $vector AS score]`,
      {
        PARAMS: {
          vector: Buffer.from(new Float32Array(embedding).buffer)
        },
        RETURN: ['name'],
        DIALECT: 2
      }
    );

    if (results.documents && results.documents.length > 0) {
      return results.documents[0].value.name;
    }

    return DEFAULT_ICON;
  } catch (err) {
    console.error('Vector search error:', err.message);
    return DEFAULT_ICON;
  }
}
```

</details>

**Don't forget:** Call `searchBestIcon()` from `updateStatus()` to automatically set the icon!

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Updated updateStatus()</summary>

```javascript
async function updateStatus(username, prefix, statusData) {
  const key = `status:${prefix}:${username}`;
  const value = {
    status: statusData.status,
    message: statusData.message || ''
  };

  // Add icon search
  if (statusData.message && statusData.message.trim()) {
    const icon = await searchBestIcon(statusData.message, prefix);
    if (icon) {
      value.icon = icon;
    }
  }

  await client.hSet(key, value);
}
```

</details>

### Desired Output

✅ After implementing this:
1. Update your status with a message like "Having coffee"
2. The UI should automatically show a ☕ coffee icon next to your message!
3. Try different messages:
   - "In a meeting" → 📅 calendar
   - "Coding" → 💻 laptop
   - "Lunch break" → 🍽️ utensils
4. Watch the icon change in real-time as you type different messages!

**Experiment!** Try creative messages and see what icons Redis finds. The AI model understands semantic similarity, so "grabbing a latte" will still match the coffee icon!

### Notes

- **Model Loading**: The embedding model downloads on first use (~20MB). Subsequent calls are fast.
- **KNN Parameter**: `KNN 1` means "find the 1 nearest neighbor". In production, you might search for more candidates and re-rank them.
- **Hybrid Search**: Redis also supports `FT.HYBRID` for combining vector search with filters (e.g., "find coffee icons tagged as 'beverage'")
- **Performance**: Vector search is very fast - typically <10ms for thousands of vectors
- **Fallback**: Always return a default icon if search fails

</details>

---

<details>
<summary><h2 style="display: inline;">Step 6: Map Search with Geospatial Queries</h2></summary>

### Introduction

The final feature: **Show users on a map!** 🗺️

In this step, you'll implement geospatial search using **Redis Query Engine** to find all users with locations inside Israel's boundaries.

**What you'll learn:**
- **GEOSHAPE**: Redis field type for storing geographic shapes
- **WKT (Well-Known Text)**: A standard format for representing geometries
- **Spatial Queries**: Search for points within a polygon
- **Redis Query Engine**: A much better alternative to SCAN for complex queries!

**How it works:**
1. Users click on the map to set their location
2. We store the location as a WKT POINT in Redis
3. We query Redis to find all users whose location is WITHIN Israel's boundary polygon
4. Display matching users on the map

### Task Details

This step has **three parts**: Create an index, store locations, and query them.

#### Part A: Download Israel Boundary Data

1. Download the GeoJSON file from [SimpleMaps](https://simplemaps.com/gis/country/il#all)
2. Save it as `il.json` in your project's root directory, update your code with the file name
3. This file contains Israel's geographic boundary as a polygon
4. Helper function to parse this file is already implemented in `geojsonToWKT()`

#### Part B: Create a Redis Search Index

We need to create an index that can search status data by location.

**Open RedisInsight** and run this command in the CLI:

```redis
FT.CREATE a_status_index
  ON HASH
  PREFIX 1 status:a:
  SCHEMA
    status TAG
    message TEXT
    icon TAG
    location GEOSHAPE SPHERICAL
```

**⚠️ Important:** Replace `a` with your prefix!
- User `a` creates `a_status_index` with prefix `status:a:`
- User `b` creates `b_status_index` with prefix `status:b:`

**What this does:**
- Creates an index named `a_status_index`
- Indexes all hash keys starting with `status:a:`
- Defines searchable fields:
  - `status`: TAG (exact match, e.g., "green", "red")
  - `message`: TEXT (full-text search)
  - `icon`: TAG (exact match)
  - `location`: GEOSHAPE with SPHERICAL coordinates (lat/lon)

**About Redis Query Engine:**
Unlike SCAN (which iterates through all keys), Redis Query Engine maintains an **index** that allows instant lookups, filtering, and complex queries. It's like having a database index on your Redis data!

#### Part C: Store Locations in WKT Format

Update your `updateStatus()` function to save locations in WKT POINT format:

```javascript
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

  // Add location in WKT format
  if (statusData.longitude && statusData.latitude) {
    value.location = `POINT(${statusData.longitude} ${statusData.latitude})`;
  }

  await client.hSet(key, value);
}
```

**WKT Format:**
- `POINT(longitude latitude)` - Note: longitude first, then latitude!
- Example: `POINT(34.7818 32.0853)` is Tel Aviv

#### Part D: Implement Geospatial Search

Locate **STEP 6** in `redis-dal.js` and implement `getStatusesWithLocation()`:

**Algorithm:**
1. Load the Israel boundary from `il.json`
2. Convert GeoJSON to WKT POLYGON format
3. Query Redis using `FT.SEARCH` with `@location:[WITHIN $shape]`
4. Return users whose location is inside Israel

**Reference:** [Redis GEOSHAPE Documentation](https://redis.io/docs/latest/develop/ai/search-and-query/indexing/geoindex/#geoshape)

<details>
<summary>⚠️ <strong>Spoiler Alert</strong> - Show Solution</summary>

```javascript
async function getStatusesWithLocation() {
  try {
    // Load Israel boundary
    const geoJson = JSON.parse(fs.readFileSync('il.json', 'utf8'));
    const coordinates = geoJson.features[0].geometry.coordinates[0];

    // Convert to WKT POLYGON
    const wktCoords = coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
    const wktPolygon = `POLYGON((${wktCoords}))`;

    // Search Redis
    const results = await client.ft.search(
      `${extractPrefixFromClient()}_status_index`,
      '@location:[WITHIN $shape]',
      {
        PARAMS: {
          shape: wktPolygon
        },
        DIALECT: 3
      }
    );

    // Parse results
    return results.documents.map(doc => {
      const result = {
        username: doc.id.split(':').slice(2).join(':'),
        status: doc.value.status || 'green',
        message: doc.value.message || '',
        icon: doc.value.icon || 'circle'
      };

      // Extract lat/lon from WKT POINT
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
```

**Helper function** to extract prefix from client (add this if needed):
```javascript
function extractPrefixFromClient() {
  // Extract prefix from username (e.g., redisboard-a -> a)
  const username = client.options.username || '';
  return username.replace(/^redisboard-/, '');
}
```

</details>

### Desired Output

✅ After implementing this:
1. Click the "📍 Pin Location" button in the UI
2. Click anywhere on the map
3. Your location marker appears with your status color!
4. Other users who set their location will also appear on the map
5. The map only shows users with locations **inside the country boundaries** (thanks to the WITHIN query!), try choosing a location outside the boundaries and see what happens.

**Try it:**
- Move your location by clicking a different spot
- Ask friends to set their locations
- Watch the map update in real-time with everyone's positions!

### Notes

- **DIALECT 3**: Required for GEOSHAPE polygon queries
- **WKT vs GeoJSON**: Redis uses WKT format, but many tools export GeoJSON - you need to convert
- **SPHERICAL**: Tells Redis to use spherical (Earth) coordinates instead of flat Cartesian
- **Performance**: Geospatial queries are very fast - Redis can search millions of points in milliseconds
- **Alternative to SCAN**: Notice how we replaced SCAN with Redis Query Engine? Much faster and more powerful!
- **Future Enhancement**: You could add filters like `@status:{green} @location:[WITHIN $shape]` to find only available users in Israel

</details>

---

<details>
<summary><h2 style="display: inline;">🎉 Congratulations!</h2></summary>

You've completed the Redis Status Board workshop! 🚀

### What You Built

You created a **real-time team status dashboard** with:
- ✅ Redis connection and authentication
- ✅ Status storage using Redis Hashes
- ✅ User listing with SCAN operations
- ✅ Real-time updates with Pub/Sub
- ✅ AI-powered icon matching with Vector Search
- ✅ Geospatial queries with Redis Query Engine

### What You Learned

**Redis Data Structures:**
- **Hashes**: Efficient storage for objects with multiple fields
- **Pub/Sub**: Real-time messaging between clients
- **Indexes**: Fast querying with Redis Query Engine

**Advanced Redis Features:**
- **Vector Search**: Semantic similarity using AI embeddings
- **Geospatial Search**: Location-based queries with GEOSHAPE
- **Full-Text Search**: Query Engine capabilities (TEXT fields)

**Best Practices:**
- Key naming conventions for multi-tenant applications
- Separate clients for pub/sub vs regular operations
- Using indexes instead of SCAN for better performance

</details>

---

<details>
<summary><h2 style="display: inline;">🚀 Optional Challenges</h2></summary>

Want to take it further? Try these enhancements (no guidance provided - you're on your own!):

### 1. **Full-Text Search Box**
Add a search input that filters users by their status message using Redis Query Engine's TEXT search capabilities.

**Hint:** Use `FT.SEARCH` with a query like `@message:(coffee)` to find all users mentioning "coffee"

### 2. **Sort and Filter Users**
Add UI controls to:
- Sort users by username or status
- Filter by status (show only Available users)
- Combine filters (Available users in Tel Aviv)

**Hint:** Redis Query Engine supports sorting with `SORTBY` and filtering with TAG fields

### 3. **Live Chat Functionality**
Implement a chat feature where users can send messages to each other.

**Options:**
- Use **Redis Streams** for a persistent message log
- Use **Redis Sorted Sets** with timestamps for chronological ordering
- Use **Pub/Sub** for ephemeral real-time chat

**Hint:** Check out [Redis Streams documentation](https://redis.io/docs/latest/develop/data-types/streams/)

### 4. **AI-Generated Status Messages**
Add a "Generate Status" button that:
- Sends a prompt to an LLM (OpenAI, Anthropic, etc.)
- Generates a creative status message
- Caches the result in Redis to avoid redundant API calls

**Hint:** Use Redis Strings with TTL for caching: `SET prompt:hash "generated message" EX 3600`

### 5. **Status History**
Track status changes over time and show a timeline.

**Hint:** Use Redis Sorted Sets with timestamps as scores

### 6. **Presence Detection**
Show who's currently online vs offline.

**Hint:** Use Redis keys with TTL that get refreshed on heartbeat

</details>

---

<details>
<summary><h2 style="display: inline;">📚 Additional Resources</h2></summary>

**Redis Documentation:**
- [Redis Commands Reference](https://redis.io/commands/)
- [Redis Data Types](https://redis.io/docs/latest/develop/data-types/)
- [Redis Query Engine](https://redis.io/docs/latest/develop/ai/search-and-query/)
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/interact/pubsub/)

**Node.js Redis Client:**
- [node-redis GitHub](https://github.com/redis/node-redis)
- [node-redis Documentation](https://redis.io/docs/latest/develop/clients/nodejs/)

**Redis Tools:**
- [RedisInsight](https://redis.io/insight/) - GUI for Redis
- [Redis CLI](https://redis.io/docs/latest/develop/tools/cli/) - Command-line interface

**Learning More:**
- [Redis University](https://university.redis.com/) - Free courses
- [Redis Blog](https://redis.io/blog/) - Latest updates and tutorials

</details>

**Happy Coding! 🎊**
