# 🔴 Redis Status Board

A real-time team status dashboard built with Node.js, Express, and Redis. Team members can update their status and see everyone else's status in real-time with live notifications.

## ✨ Features

- **Real-time Updates**: Server-Sent Events (SSE) for instant status notifications
- **Redis Pub/Sub**: Broadcasts status changes to all connected users
- **Persistent Sessions**: Auto-login with localStorage credential caching
- **Redis Hashes**: Native Redis hash storage for structured data
- **Vector Search**: AI-powered icon selection using semantic embeddings
- **Geospatial Queries**: Map-based location tracking with Redis GEOSHAPE
- **ACL Support**: Multi-user isolation with Redis ACL permissions
- **Dark Mode UI**: Modern, clean interface with smooth animations

## 🏗️ Architecture

### Key Pattern: `status:{prefix}:{username}`

- User `redisboard-a` → Key: `status:a:redisboard-a`
- User `redisboard-b` → Key: `status:b:redisboard-b`

### Data Structure (Redis Hash)

```
HGETALL status:a:redisboard-a
status: "green"
message: "Working on feature X"
icon: "laptop"
location: "POINT(34.7818 32.0853)"
```

### Clean Separation of Concerns

- **`redis-dal.js`**: Core Redis operations (data access layer)
- **`server.js`**: Business logic and API endpoints
- **`public/index.html`**: Frontend UI and real-time updates

## 📦 Dependencies

- **express**: Web server framework
- **cors**: Cross-Origin Resource Sharing
- **redis**: Redis client for Node.js
- **@xenova/transformers**: AI embeddings for vector search

## 🛠️ Development

The codebase is structured for educational purposes with clear separation between:

1. **Data Access Layer** (`redis-dal.js`): Generic Redis operations
2. **Business Logic** (`server.js`): Application-specific logic
3. **Frontend** (`public/index.html`): User interface and real-time features

```bash
# Install dependencies
npm install

# Start the server
node server.js
```

The app will be available at `http://localhost:3000`

## 🎓 Workshop Guide

### Prerequisites

Before starting the workshop, make sure you have:

1. **Redis account** with credentials:
   - Redis URL (format: `redis://host:port` or `rediss://host:port`)
   - Username (e.g., `redisboard-a`)
   - Password

2. **Open in GitHub Codespaces (Instant Setup)**  
   <a href="https://github.com/codespaces/new/itay-ct/redis-status-board">
     <img src="https://github.com/codespaces/badge.svg" height="20" />
   </a>
   
   Alternatively you can run this locally with - **Node.js** installed locally (v14 or higher)

3. **This repository** cloned and dependencies installed (`npm install`)

**Ready to build this project step-by-step?**

👉 **[Start the Workshop Guide](guide.md)**

The workshop guide will walk you through implementing all Redis operations from scratch!

## 📝 License

MIT
