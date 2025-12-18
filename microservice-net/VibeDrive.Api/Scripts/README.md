# Redis Publishing Scripts

Quick scripts to publish messages to Redis for testing the Redis → SignalR flow.

## Prerequisites

- Redis server running on `localhost:6379`
- .NET API running and connected to SignalR

## Usage

### PowerShell Script

```powershell
.\test-redis-publish.ps1 -UserId "driver123" -Message "Hello from Redis!"
```

### Bash Script (WSL/Linux)

```bash
chmod +x test-redis-publish.sh
./test-redis-publish.sh driver123 "Hello from Redis!"
```

### Node.js Script

```bash
npm install redis
node test-redis-publish.js driver123 "Hello from Redis!"
```

### PHP Script

```bash
php test-redis-publish.php driver123 "Hello from Redis!"
```

## Quick Test Flow

1. **Start your .NET API:**
   ```bash
   dotnet run
   ```

2. **Open test client in browser:**
   - Go to: `https://localhost:7217/test-client.html`
   - Enter User ID: `driver123`
   - Click "Connect"

3. **Publish message to Redis:**
   ```bash
   # Using Redis CLI
   redis-cli PUBLISH driver_updates '{"userId":"driver123","type":"test","data":"Hello from Redis!"}'
   
   # Or using one of the scripts above
   ```

4. **See the message appear in your SignalR client!**

## Message Format

The scripts use this JSON format:
```json
{
  "userId": "driver123",
  "type": "test",
  "data": "Your message here",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

