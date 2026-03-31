using StackExchange.Redis;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using System.Text.Json.Nodes;
using VibeDrive.Api.Hubs;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models;

namespace VibeDrive.Api.Services;

public class RedisListenerService : BackgroundService, IRedisListenerService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly IHubContext<DriverHub> _hubContext;
    private readonly ILogger<RedisListenerService> _logger;
    private readonly IOpenAIService? _openAIService;
    private readonly IRouteLoadsService _routeLoadsService;
    private ISubscriber? _subscriber;
    private const int MaxRetryDelay = 30000;
    private const int InitialRetryDelay = 1000;

    public RedisListenerService(
        IConnectionMultiplexer redis,
        IHubContext<DriverHub> hubContext,
        ILogger<RedisListenerService> logger,
        IRouteLoadsService routeLoadsService,
        IOpenAIService? openAIService = null)
    {
        _redis = redis;
        _hubContext = hubContext;
        _logger = logger;
        _routeLoadsService = routeLoadsService;
        _openAIService = openAIService;
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

        LogMessageReadable(driverMessage);

        if (driverMessage.Type == "audio_recording" && _openAIService != null)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await SendAudioToOpenAIAsync(driverMessage, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error sending audio to OpenAI for user {UserId}", driverMessage.UserId);
                }
            }, cancellationToken);
        }

        await _hubContext.Clients.Group(driverMessage.UserId).SendAsync(
            "ReceiveMessage", 
            driverMessage.Data ?? messageString, 
            cancellationToken);
        
        _logger.LogInformation("Message forwarded to user {UserId} via SignalR", driverMessage.UserId);
    }

    private void LogMessageReadable(DriverUpdateMessage message)
    {
        if (message.Type == "audio_recording" && message.Data != null)
        {
            try
            {
                var dataNode = JsonNode.Parse(JsonSerializer.Serialize(message.Data));
                var dataObj = dataNode?.AsObject();

                if (dataObj != null)
                {
                    var filename = dataObj["filename"]?.ToString() ?? "unknown";
                    var audioUri = dataObj["audio_uri"]?.ToString() ?? "unknown";
                    var duration = dataObj["duration"]?.ToString() ?? "unknown";
                    var fileSize = dataObj["file_size"]?.ToString() ?? "unknown";
                    var timestamp = dataObj["timestamp"]?.ToString() ?? "unknown";
                    var base64Length = dataObj["audio_base64"]?.ToString()?.Length ?? 0;

                    _logger.LogInformation(
                        "Successfully loaded audio recording - UserId: {UserId}, Filename: {Filename}, Duration: {Duration}s, FileSize: {FileSize} bytes, Base64Length: {Base64Length} chars, Timestamp: {Timestamp}, AudioUri: {AudioUri}",
                        message.UserId,
                        filename,
                        duration,
                        fileSize,
                        base64Length,
                        timestamp,
                        audioUri
                    );
                }
                else
                {
                    _logger.LogInformation("Received audio_recording message for user {UserId}", message.UserId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse audio_recording data for readable log. UserId: {UserId}", message.UserId);
            }
        }
        else
        {
            _logger.LogInformation("Received message from Redis - Type: {Type}, UserId: {UserId}", message.Type, message.UserId);
        }
    }

    public async Task StopListeningAsync()
    {
        if (_subscriber != null)
        {
            await _subscriber.UnsubscribeAsync(RedisChannel.Literal("driver_updates"));
            _logger.LogInformation("Redis listener stopped");
        }
    }

    private async Task SendAudioToOpenAIAsync(DriverUpdateMessage message, CancellationToken cancellationToken)
    {
        if (_openAIService == null || message.Data == null)
        {
            return;
        }

        try
        {
            var dataNode = JsonNode.Parse(JsonSerializer.Serialize(message.Data));
            var dataObj = dataNode?.AsObject();

            if (dataObj == null)
            {
                return;
            }

            var audioBase64 = dataObj["audio_base64"]?.ToString();
            var filename = dataObj["filename"]?.ToString() ?? "recording.m4a";
            var context = TryExtractContext(dataObj);

            if (string.IsNullOrEmpty(audioBase64))
            {
                _logger.LogWarning("No audio_base64 data found in audio_recording message for user {UserId}", message.UserId);
                return;
            }

            var audioData = Convert.FromBase64String(audioBase64);

            _logger.LogInformation("Sending audio to OpenAI for transcription - UserId: {UserId}, Filename: {Filename}, Size: {Size} bytes", 
                message.UserId, filename, audioData.Length);

            var transcription = await _openAIService.TranscribeAudioAsync(audioData, filename, cancellationToken);

            if (!string.IsNullOrEmpty(transcription))
            {
                _logger.LogInformation("Audio transcription completed for user {UserId} - Transcription: {Transcription}", 
                    message.UserId, transcription);

                await ProcessTranscriptionAsync(message.UserId, transcription, context, cancellationToken);
            }
            else
            {
                _logger.LogWarning("Audio transcription returned empty result for user {UserId}", message.UserId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send audio to OpenAI for user {UserId}", message.UserId);
        }
    }

    private async Task ProcessTranscriptionAsync(string userId, string transcription, RouteLoadsContext context, CancellationToken cancellationToken)
    {
        if (_openAIService == null)
        {
            return;
        }

        try
        {
            string? commandJson = await _openAIService.ProcessTranscriptionWithContextAsync(transcription, context, cancellationToken);

            if (string.IsNullOrEmpty(commandJson))
            {
                commandJson = await _openAIService.ProcessTranscriptionAsync(transcription, cancellationToken);
            }

            if (string.IsNullOrEmpty(commandJson))
            {
                _logger.LogWarning("Failed to process transcription for user {UserId}", userId);
                return;
            }

            var commandDoc = JsonDocument.Parse(commandJson);
            var action = commandDoc.RootElement.TryGetProperty("action", out var actionElement)
                ? actionElement.GetString()
                : null;
            var query = commandDoc.RootElement.TryGetProperty("query", out var queryElement)
                ? queryElement.GetString()
                : null;
            var index = commandDoc.RootElement.TryGetProperty("index", out var indexElement) && indexElement.ValueKind == JsonValueKind.Number
                ? indexElement.GetInt32()
                : (int?)null;

            _logger.LogInformation("Processed transcription command - UserId: {UserId}, Action: {Action}, Query: {Query}, Index: {Index}",
                userId, action, query, index);

            var normalizedAction = action?.Trim().ToLowerInvariant();
            var normalizedQuery = query?.Trim();
            var normalizedTranscription = transcription?.Trim();

            if (string.IsNullOrWhiteSpace(normalizedQuery))
            {
                normalizedQuery = normalizedTranscription;
            }

            if (normalizedAction == "list_loads")
            {
                await SendListLoadsTtsAsync(userId, context, cancellationToken);
                return;
            }
            if (normalizedAction == "list_route")
            {
                await SendListRouteTtsAsync(userId, context, cancellationToken);
                return;
            }
            if (normalizedAction == "accept_load" && index.HasValue && index.Value >= 1)
            {
                await SendAcceptLoadCommandAsync(userId, index.Value, cancellationToken);
                return;
            }

            if (normalizedAction == "play_music" || IsMusicIntent(normalizedAction, normalizedQuery, normalizedTranscription))
            {
                await SendPlayMusicCommandAsync(userId, normalizedQuery ?? "music", cancellationToken);
            }
            else if (normalizedAction == "respond" && !string.IsNullOrEmpty(normalizedQuery))
            {
                await SendAIResponseAsync(userId, normalizedQuery, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process transcription for user {UserId}", userId);
        }
    }

    private async Task SendAcceptLoadCommandAsync(string userId, int oneBasedIndex, CancellationToken cancellationToken)
    {
        try
        {
            var payload = new
            {
                type = "accept_load",
                data = new
                {
                    index = oneBasedIndex
                },
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            };
            var messageJson = JsonSerializer.Serialize(payload);
            await _hubContext.Clients.Group(userId).SendAsync("ReceiveMessage", messageJson, cancellationToken);
            _logger.LogInformation("Sent accept_load command to user {UserId} (index {Index})", userId, oneBasedIndex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send accept_load command to user {UserId}", userId);
        }
    }

    private static RouteLoadsContext TryExtractContext(JsonObject dataObj)
    {
        try
        {
            var ctx = new RouteLoadsContext();

            var activeRouteNode = dataObj["active_route"];
            if (activeRouteNode != null)
            {
                var activeRoute = activeRouteNode.Deserialize<ActiveRouteDto>(new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                ctx.ActiveRoute = activeRoute;
            }

            var proposedLoadsNode = dataObj["proposed_loads"];
            if (proposedLoadsNode != null)
            {
                var loads = proposedLoadsNode.Deserialize<List<FreightLoadDto>>(new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                if (loads != null)
                {
                    ctx.ProposedLoads = loads;
                }
            }

            return ctx;
        }
        catch
        {
            return new RouteLoadsContext();
        }
    }

    private async Task SendTtsMessageAsync(string userId, string message, CancellationToken cancellationToken)
    {
        try
        {
            var responseMessage = new
            {
                type = "ai_response",
                data = new
                {
                    message,
                    original_query = (string?)null
                },
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            };
            var messageJson = JsonSerializer.Serialize(responseMessage);
            await _hubContext.Clients.Group(userId).SendAsync("ReceiveMessage", messageJson, cancellationToken);
            _logger.LogInformation("Sent TTS message to user {UserId}", userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send TTS message to user {UserId}", userId);
        }
    }

    private async Task SendListRouteTtsAsync(string userId, RouteLoadsContext context, CancellationToken cancellationToken)
    {
        if (context.ActiveRoute != null)
        {
            var msg = $"Your route is {context.ActiveRoute.OriginCity} to {context.ActiveRoute.DestCity}. Capacity {context.ActiveRoute.WeightKg} kg, {context.ActiveRoute.VolumeM3} cubic meters.";
            await SendTtsMessageAsync(userId, msg, cancellationToken);
        }
        else
        {
            await SendTtsMessageAsync(userId, "You don't have an active route. Set one in Route Setup.", cancellationToken);
        }
    }

    private async Task SendListLoadsTtsAsync(string userId, RouteLoadsContext context, CancellationToken cancellationToken)
    {
        var parts = new List<string>();
        if (context.ActiveRoute != null)
        {
            parts.Add($"Your route is {context.ActiveRoute.OriginCity} to {context.ActiveRoute.DestCity}.");
        }
        if (context.ProposedLoads.Count > 0)
        {
            var list = string.Join(" ", context.ProposedLoads.Select((l, i) => $"{i + 1}. {l.OriginCity} to {l.DestCity}, {l.Currency} {l.RateAmount}."));
            parts.Add("Proposed loads: " + list);
        }
        else
        {
            parts.Add("No proposed loads right now.");
        }
        await SendTtsMessageAsync(userId, string.Join(" ", parts), cancellationToken);
    }

    private static bool IsMusicIntent(string? action, string? query, string? transcription)
    {
        var text = $"{action ?? string.Empty} {query ?? string.Empty} {transcription ?? string.Empty}".ToLowerInvariant();

        var hasMusicNoun =
            text.Contains("spotify") ||
            text.Contains("music") ||
            text.Contains("song") ||
            text.Contains("playlist") ||
            text.Contains("album") ||
            text.Contains("artist") ||
            text.Contains("band") ||
            text.Contains("track");

        var hasPlayVerb =
            text.Contains("play ") ||
            text.Contains("play_") ||
            text.Contains("open ") ||
            text.Contains("start ") ||
            text.Contains("put on") ||
            text.Contains("listen");

        var looksLikeQuestion =
            text.TrimStart().StartsWith("what ") ||
            text.TrimStart().StartsWith("who ") ||
            text.TrimStart().StartsWith("why ") ||
            text.TrimStart().StartsWith("how ") ||
            text.TrimStart().StartsWith("when ") ||
            text.TrimStart().StartsWith("where ");

        if (looksLikeQuestion && !hasPlayVerb)
        {
            return false;
        }

        return hasPlayVerb && (hasMusicNoun || text.Contains("spotify:"));
    }

    private async Task SendPlayMusicCommandAsync(string userId, string query, CancellationToken cancellationToken)
    {
        try
        {
            var playMusicMessage = new
            {
                type = "play_music",
                data = new
                {
                    query = query
                },
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            };

            var messageJson = JsonSerializer.Serialize(playMusicMessage);

            await _hubContext.Clients.Group(userId).SendAsync(
                "ReceiveMessage",
                messageJson,
                cancellationToken);

            _logger.LogInformation("Sent play_music command to user {UserId} - Query: {Query}", userId, query);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send play_music command to user {UserId}", userId);
        }
    }

    private async Task SendAIResponseAsync(string userId, string userMessage, CancellationToken cancellationToken)
    {
        if (_openAIService == null)
        {
            return;
        }

        try
        {
            var aiResponse = await _openAIService.GenerateResponseAsync(userMessage, cancellationToken);

            if (string.IsNullOrEmpty(aiResponse))
            {
                _logger.LogWarning("Failed to generate AI response for user {UserId}", userId);
                return;
            }

            var responseMessage = new
            {
                type = "ai_response",
                data = new
                {
                    message = aiResponse,
                    original_query = userMessage
                },
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            };

            var messageJson = JsonSerializer.Serialize(responseMessage);

            await _hubContext.Clients.Group(userId).SendAsync(
                "ReceiveMessage",
                messageJson,
                cancellationToken);

            _logger.LogInformation("Sent AI response to user {UserId} - Response: {Response}", userId, aiResponse);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send AI response to user {UserId}", userId);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await StopListeningAsync();
        await base.StopAsync(cancellationToken);
    }
}

