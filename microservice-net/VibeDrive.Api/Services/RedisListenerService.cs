using StackExchange.Redis;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using VibeDrive.Api.Hubs;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models;

namespace VibeDrive.Api.Services;

public class RedisListenerService : BackgroundService, IRedisListenerService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly IHubContext<DriverHub> _hubContext;
    private readonly ILogger<RedisListenerService> _logger;
    private ISubscriber? _subscriber;
    private const int MaxRetryDelay = 30000;
    private const int InitialRetryDelay = 1000;

    public RedisListenerService(
        IConnectionMultiplexer redis,
        IHubContext<DriverHub> hubContext,
        ILogger<RedisListenerService> logger)
    {
        _redis = redis;
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Redis listener service starting...");

        _redis.ConnectionFailed += (sender, e) =>
        {
            _logger.LogWarning("Redis connection failed: {FailureType}, EndPoint: {EndPoint}", 
                e.FailureType, e.EndPoint);
        };

        _redis.ConnectionRestored += (sender, e) =>
        {
            _logger.LogInformation("Redis connection restored: {EndPoint}", e.EndPoint);
        };

        var retryCount = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!_redis.IsConnected)
                {
                    _logger.LogWarning("Redis is not connected. Waiting for connection... (Attempt {RetryCount})", retryCount + 1);
                    
                    var delay = Math.Min(InitialRetryDelay * (int)Math.Pow(2, retryCount), MaxRetryDelay);
                    await Task.Delay(delay, stoppingToken);
                    retryCount++;
                    continue;
                }

                retryCount = 0;
                await StartListeningAsync(stoppingToken);
            }
            catch (RedisConnectionException ex)
            {
                _logger.LogError(ex, "Redis connection error. Will retry...");
                var delay = Math.Min(InitialRetryDelay * (int)Math.Pow(2, retryCount), MaxRetryDelay);
                await Task.Delay(delay, stoppingToken);
                retryCount++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in Redis listener. Will retry...");
                var delay = Math.Min(InitialRetryDelay * (int)Math.Pow(2, retryCount), MaxRetryDelay);
                await Task.Delay(delay, stoppingToken);
                retryCount++;
            }
        }
    }

    public async Task StartListeningAsync(CancellationToken cancellationToken)
    {
        if (!_redis.IsConnected)
        {
            throw new RedisConnectionException(ConnectionFailureType.UnableToConnect, 
                "Redis is not connected");
        }

        _subscriber = _redis.GetSubscriber();
        
        await _subscriber.SubscribeAsync(RedisChannel.Literal("driver_updates"), async (channel, message) =>
        {
            try
            {
                await ProcessMessageAsync(message, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing Redis message");
            }
        });

        _logger.LogInformation("Redis listener started and listening to 'driver_updates' channel");

        while (!cancellationToken.IsCancellationRequested && _redis.IsConnected)
        {
            await Task.Delay(1000, cancellationToken);
        }

        if (!_redis.IsConnected)
        {
            _logger.LogWarning("Redis connection lost. Will attempt to reconnect...");
        }
    }

    private async Task ProcessMessageAsync(RedisValue message, CancellationToken cancellationToken)
    {
        var messageString = message.ToString();
        
        if (string.IsNullOrEmpty(messageString))
        {
            _logger.LogWarning("Received empty message from Redis");
            return;
        }

        _logger.LogInformation("Received message from Redis: {Message}", messageString);

        DriverUpdateMessage? driverMessage = null;

        try
        {
            driverMessage = JsonSerializer.Deserialize<DriverUpdateMessage>(messageString, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize message as JSON. Attempting fallback parsing.");
            
            var messageParts = messageString.Split('|', 2);
            if (messageParts.Length >= 2)
            {
                driverMessage = new DriverUpdateMessage
                {
                    UserId = messageParts[0],
                    Data = messageParts[1],
                    Type = "update"
                };
            }
        }

        if (driverMessage == null || string.IsNullOrEmpty(driverMessage.UserId))
        {
            _logger.LogWarning("Invalid message format. Expected JSON with userId or format: userId|message");
            return;
        }

        await _hubContext.Clients.Group(driverMessage.UserId).SendAsync(
            "ReceiveMessage", 
            driverMessage.Data ?? messageString, 
            cancellationToken);
        
        _logger.LogInformation("Message forwarded to user {UserId} via SignalR", driverMessage.UserId);
    }

    public async Task StopListeningAsync()
    {
        if (_subscriber != null)
        {
            await _subscriber.UnsubscribeAsync(RedisChannel.Literal("driver_updates"));
            _logger.LogInformation("Redis listener stopped");
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await StopListeningAsync();
        await base.StopAsync(cancellationToken);
    }
}

