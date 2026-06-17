# VibeDrive Real-time Bridge Microservice

A .NET 8 Web API microservice that acts as a real-time bridge between a server backend (via Redis) and a React Native mobile app (via SignalR WebSockets).

## Architecture

```
Server Backend → Redis Pub/Sub → .NET Service → SignalR → React Native App
```

## Project Structure

```
VibeDrive.Api/
├── Hubs/
│   └── DriverHub.cs                    # SignalR Hub for driver connections
├── Services/
│   ├── ConnectionManager.cs            # Manages SignalR connection mappings
│   └── RedisListenerService.cs         # Background service listening to Redis
├── Controllers/
│   └── DriverController.cs             # API controllers with server compatibility
├── Models/
│   ├── DriverUpdateMessage.cs          # Message model for Redis messages
│   └── ServerResponse.cs               # Server-compatible response wrapper
├── Converters/
│   ├── ServerDateTimeConverter.cs      # Server date format converter
│   ├── StringToIntConverter.cs         # Handles loose typing (string to int)
│   ├── StringToDoubleConverter.cs      # Handles loose typing (string to double)
│   └── NullableStringToIntConverter.cs # Handles empty strings as null
├── Interfaces/
│   ├── IConnectionManager.cs          # Connection management interface
│   └── IRedisListenerService.cs        # Redis listener interface
├── wwwroot/
│   └── test-client.html                # Web-based test client
├── Scripts/
│   └── test-redis-publish.*            # Scripts for testing Redis publishing
├── Program.cs                          # Application entry point & configuration
└── appsettings.json                     # Configuration
```

## Features

- ✅ **SignalR Hub** for real-time WebSocket communication
- ✅ **Redis Pub/Sub** integration for receiving messages from server backend
- ✅ **Connection Management** with UserId mapping
- ✅ **Background Service** for continuous Redis listening with automatic reconnection
- ✅ **CORS** configuration for mobile app access
- ✅ **Server Compatibility** - snake_case JSON, response wrappers, type converters
- ✅ **JSON & Simple Message Format** support
- ✅ **Comprehensive Logging**

## Server Compatibility Features

- **Snake Case JSON** - Automatic `snake_case` serialization/deserialization
- **Server Response Wrapper** - Standardized `{status, code, data, message}` format
- **Type Converters** - Handles loose typing (strings as numbers, empty strings as null)
- **Server Date Format** - Converts dates to "yyyy-MM-dd HH:mm:ss" format
- **Route Matching** - Exact route matching with server backend conventions

## Quick Start

### 1. Prerequisites

- .NET 8 SDK
- Redis Server (default: `localhost:6379`)

### 2. Configuration

**OpenAI API key (local or droplet):**

- **Option A – file (not in Git):** Copy the example and set your key:
  ```bash
  cp appsettings.Development.local.json.example appsettings.Development.local.json
  ```
  Edit `appsettings.Development.local.json` and set `OpenAI:ApiKey` to your key. This file is gitignored.
- **Option B – environment:** Set `OPENAI_API_KEY` (overrides config).

**Other settings:** update `appsettings.json`:
```json
{
  "Redis": {
    "ConnectionString": "localhost:6379"
  },
  "Cors": {
    "AllowedOrigins": ["http://localhost:3000"]
  }
}
```

### 3. Run

```bash
cd microservice-net/VibeDrive.Api
dotnet run
```

The API will start on:
- HTTP: `http://localhost:5009`
- HTTPS: `https://localhost:7217`
- SignalR Hub: `/driverhub`

### 4. Test

1. Open `http://localhost:5009/test-client.html`
2. Connect with a User ID (e.g., `driver123`)
3. Publish a message to Redis:
   ```bash
   wsl redis-cli PUBLISH driver_updates '{"userId":"driver123","type":"update","data":"Test message"}'
   ```

## API Endpoints

### SignalR Hub
- **Endpoint**: `/driverhub`
- **Connection**: `?userId=driver123` or `X-UserId` header
- **Events**: `ReceiveMessage` - receives messages from Redis

### REST API (Example)
- **GET** `/api/v1/driver_profile/{id}` - Get driver profile
- **GET** `/api/v1/rides?sort_by=date&dir=desc` - Get rides with query parameters
- **POST** `/api/v1/rides` - Create ride

All REST endpoints return responses wrapped in `ServerResponse<T>` format:
```json
{
  "status": "success",
  "code": 200,
  "data": { ... },
  "message": "Optional message"
}
```

## Message Format

### JSON (Recommended)
```json
{
  "userId": "driver123",
  "type": "update",
  "data": "Message content or object",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Simple Format (Fallback)
```
driver123|Message content
```

## Testing

### Web Test Client
1. Start the API: `dotnet run`
2. Open: `http://localhost:5009/test-client.html`
3. Connect with a User ID
4. Publish messages to Redis using the scripts in `Scripts/` folder

### Using Scripts
```bash
# PowerShell
.\Scripts\test-redis-publish.ps1 -UserId "driver123" -Message "Hello"

# Bash/WSL
./Scripts/test-redis-publish.sh driver123 "Hello"

# Node.js
node Scripts/test-redis-publish.js driver123 "Hello"

# PHP
php Scripts/test-redis-publish.php driver123 "Hello"
```

### Redis CLI
```bash
wsl redis-cli PUBLISH driver_updates '{"userId":"driver123","type":"test","data":"Hello from Redis"}'
```

## Technology Stack

- **.NET 8** - Web API framework
- **SignalR** - Real-time WebSocket communication
- **StackExchange.Redis** - Redis client
- **ASP.NET Core** - Hosting and middleware

## Configuration Details

### JSON Serialization
- Global `snake_case` naming policy
- Server-compatible date formatting
- Type converters for loose typing support

### CORS
- Development: Allows all origins
- Production: Configured origins from `appsettings.json`

### Redis Connection
- Automatic reconnection with exponential backoff
- Resilient to connection failures
- Background service continues running even if Redis is unavailable
