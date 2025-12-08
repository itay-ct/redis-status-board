# 🔴 Redis Status Board

A real-time team status dashboard built with Node.js, Express, and Redis. Team members can update their status and see everyone else's status in real-time with live notifications.

## ✨ Features

- **Real-time Updates**: Server-Sent Events (SSE) for instant status notifications
- **Redis Pub/Sub**: Broadcasts status changes to all connected users
- **Persistent Sessions**: Auto-login with localStorage credential caching
- **Redis Hashes**: Native Redis hash storage for structured data
- **ACL Support**: Multi-user isolation with Redis ACL permissions
- **Dark Mode UI**: Modern, clean interface with smooth animations
- **Live Notifications**: Bottom-right popup notifications for status changes

## 🏗️ Architecture

### Key Pattern: `{prefix}:status:{username}`

- User `redisboard-a` → Key: `a:status:redisboard-a`
- User `redisboard-b` → Key: `b:status:redisboard-b`

### Data Structure (Redis Hash)

```
HGETALL a:status:redisboard-a
status: "green"
message: "Working on feature X"
```

### Clean Separation of Concerns

- **`redis-dal.js`**: Core Redis operations (data access layer)
- **`server.js`**: Business logic and API endpoints
- **`public/index.html`**: Frontend UI and real-time updates

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Redis server with ACL support

### Installation

```bash
# Install dependencies
npm install

# Start the server
node server.js
```

The app will be available at `http://localhost:3000`

### Redis ACL Setup

Configure Redis users with appropriate permissions:

```bash
# User A - can read all statuses, write only to a:* namespace
ACL SETUSER redisboard-a on >password +@read +@write +@connection -@dangerous %R~*:status:* %W~a:*

# User B - can read all statuses, write only to b:* namespace
ACL SETUSER redisboard-b on >password +@read +@write +@connection -@dangerous %R~*:status:* %W~b:*
```

## 📡 API Endpoints

### `POST /api/connect-test`
Test Redis connection and retrieve current user status.

**Request:**
```json
{
  "url": "redis://host:port",
  "username": "redisboard-a",
  "password": "password"
}
```

**Response:**
```json
{
  "ok": true,
  "pong": "PONG",
  "currentStatus": {
    "status": "green",
    "message": "Working on feature"
  }
}
```

### `POST /api/list-users`
Get all user statuses.

**Response:**
```json
{
  "ok": true,
  "users": [
    {
      "username": "redisboard-a",
      "status": "green",
      "message": "Available"
    }
  ]
}
```

### `POST /api/update-status`
Update user status and broadcast to all clients.

**Request:**
```json
{
  "url": "redis://host:port",
  "username": "redisboard-a",
  "password": "password",
  "myUsername": "redisboard-a",
  "status": "red",
  "message": "In a meeting"
}
```

### `GET /api/updates`
Server-Sent Events stream for real-time updates.

## 🎨 Status Values

- 🟢 **green**: Available
- 🔴 **red**: Busy
- 🟣 **purple**: Away

## 🔐 Security Features

- Redis ACL namespace isolation
- Credential caching in browser localStorage
- No credentials stored on server
- Per-user write permissions

## 📦 Dependencies

- **express**: Web server framework
- **cors**: Cross-Origin Resource Sharing
- **redis**: Redis client for Node.js

## 🛠️ Development

The codebase is structured for educational purposes with clear separation between:

1. **Data Access Layer** (`redis-dal.js`): Generic Redis operations
2. **Business Logic** (`server.js`): Application-specific logic
3. **Frontend** (`public/index.html`): User interface and real-time features

## 📝 License

MIT

