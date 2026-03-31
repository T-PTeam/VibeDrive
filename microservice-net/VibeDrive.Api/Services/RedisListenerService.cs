using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.SignalR;
using StackExchange.Redis;
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
    private readonly IPendingActionStore _pendingActionStore;
    private ISubscriber? _subscriber;
    private const int MaxRetryDelay = 30000;
    private const int InitialRetryDelay = 1000;

    public RedisListenerService(
        IConnectionMultiplexer redis,
        IHubContext<DriverHub> hubContext,
        ILogger<RedisListenerService> logger,
        IRouteLoadsService routeLoadsService,
        IPendingActionStore pendingActionStore,
        IOpenAIService? openAIService = null)
    {
        _redis = redis;
        _hubContext = hubContext;
        _logger = logger;
        _routeLoadsService = routeLoadsService;
        _pendingActionStore = pendingActionStore;
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

        if (string.Equals(driverMessage.Type, "voice_confirmation", StringComparison.OrdinalIgnoreCase))
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await ProcessVoiceConfirmationAsync(driverMessage, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "voice_confirmation failed for user {UserId}", driverMessage.UserId);
                }
            }, cancellationToken);
            return;
        }

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

    private async Task ProcessTranscriptionAsync(string userId, string transcription, RouteLoadsContext mobileContext, CancellationToken cancellationToken)
    {
        if (_openAIService == null)
        {
            return;
        }

        try
        {
            var serverContext = await _routeLoadsService.GetContextAsync(userId, cancellationToken);
            var merged = MergeContexts(serverContext, mobileContext);
            var pendingSnapshot = await _pendingActionStore.GetAsync(userId, cancellationToken);
            merged.PendingAction = pendingSnapshot;

            string? commandJson = await _openAIService.ProcessTranscriptionWithContextAsync(transcription, merged, cancellationToken);

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
            var root = commandDoc.RootElement;
            var action = root.TryGetProperty("action", out var actionElement) ? actionElement.GetString() : null;
            var query = root.TryGetProperty("query", out var queryElement) ? queryElement.GetString() : null;
            var index = TryGetInt(root, "index");
            var loadIndex = TryGetInt(root, "load_index") ?? index;
            var proposalMessage = TryGetString(root, "message");
            var destCity = TryGetString(root, "dest_city");
            var weightKg = TryGetDecimal(root, "weight_kg");
            var volumeM3 = TryGetDecimal(root, "volume_m3");
            var originCity = TryGetString(root, "origin_city");

            _logger.LogInformation(
                "Processed transcription command - UserId: {UserId}, Action: {Action}, Query: {Query}, LoadIndex: {LoadIndex}",
                userId, action, query, loadIndex);

            var normalizedAction = action?.Trim().ToLowerInvariant();
            var normalizedQuery = query?.Trim();
            var normalizedTranscription = transcription?.Trim();

            if (string.IsNullOrWhiteSpace(normalizedQuery))
            {
                normalizedQuery = normalizedTranscription;
            }

            if (normalizedAction == "confirm")
            {
                await HandleConfirmAsync(userId, cancellationToken);
                return;
            }

            if (normalizedAction == "reject")
            {
                await HandleRejectAsync(userId, cancellationToken);
                return;
            }

            if (normalizedAction == "list_loads" || normalizedAction == "search_loads")
            {
                await SendListLoadsTtsAsync(userId, merged, cancellationToken);
                return;
            }

            if (normalizedAction == "list_route")
            {
                await SendListRouteTtsAsync(userId, merged, cancellationToken);
                return;
            }

            if (normalizedAction == "propose_accept_load" || normalizedAction == "accept_load")
            {
                if (loadIndex.HasValue && loadIndex.Value >= 1)
                {
                    await HandleProposeAcceptLoadAsync(userId, merged, loadIndex.Value, proposalMessage, cancellationToken);
                }

                return;
            }

            if (normalizedAction == "set_route" || normalizedAction == "update_route")
            {
                await HandleSetRouteAsync(userId, destCity, weightKg, volumeM3, originCity, cancellationToken);
                return;
            }

            if (normalizedAction == "update_cargo_status")
            {
                await SendTtsMessageAsync(
                    userId,
                    "Cargo status updates are not available yet. You can ask about your route or loads.",
                    cancellationToken);
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

    private async Task ProcessVoiceConfirmationAsync(DriverUpdateMessage message, CancellationToken cancellationToken)
    {
        if (message.Data == null)
        {
            return;
        }

        var dataNode = JsonNode.Parse(JsonSerializer.Serialize(message.Data));
        var dataObj = dataNode?.AsObject();
        var choice = dataObj?["choice"]?.ToString()?.Trim().ToLowerInvariant();
        if (choice == "confirm")
        {
            await HandleConfirmAsync(message.UserId, cancellationToken);
        }
        else if (choice == "reject")
        {
            await HandleRejectAsync(message.UserId, cancellationToken);
        }
    }

    private async Task HandleConfirmAsync(string userId, CancellationToken cancellationToken)
    {
        var pending = await _pendingActionStore.GetAsync(userId, cancellationToken);
        if (pending == null)
        {
            await SendTtsMessageAsync(userId, "Nothing to confirm.", cancellationToken);
            return;
        }

        if (pending.Type == "accept_load")
        {
            ActiveRouteDto? route = null;
            if (!string.IsNullOrEmpty(pending.LoadId))
            {
                route = await _routeLoadsService.AcceptLoadByIdAsync(userId, pending.LoadId, cancellationToken);
            }

            if (route == null && pending.OneBasedIndex is int idx && idx >= 1)
            {
                route = await _routeLoadsService.AcceptLoadByIndexAsync(userId, idx, cancellationToken);
            }

            await _pendingActionStore.ClearAsync(userId, cancellationToken);
            if (route != null)
            {
                await SendTtsMessageAsync(
                    userId,
                    $"Load accepted. Your route is now {route.OriginCity} to {route.DestCity}.",
                    cancellationToken,
                    route);
            }
            else
            {
                await SendTtsMessageAsync(userId, "Could not accept that load. Please try again.", cancellationToken);
            }

            return;
        }

        await _pendingActionStore.ClearAsync(userId, cancellationToken);
        await SendTtsMessageAsync(userId, "That action is not supported yet.", cancellationToken);
    }

    private async Task HandleRejectAsync(string userId, CancellationToken cancellationToken)
    {
        await _pendingActionStore.ClearAsync(userId, cancellationToken);
        await SendTtsMessageAsync(
            userId,
            "Okay, cancelled. Say if you want to list loads or choose another option.",
            cancellationToken);
    }

    private async Task HandleProposeAcceptLoadAsync(
        string userId,
        RouteLoadsContext merged,
        int loadIndex,
        string? proposalMessage,
        CancellationToken cancellationToken)
    {
        var loadId = ResolveLoadId(merged, loadIndex);
        RouteLoadsContext resolveContext = merged;
        if (string.IsNullOrEmpty(loadId))
        {
            var refreshed = await _routeLoadsService.GetProposedLoadsAsync(userId, cancellationToken);
            if (refreshed.Count > 0)
            {
                resolveContext = new RouteLoadsContext
                {
                    ActiveRoute = merged.ActiveRoute,
                    ProposedLoads = refreshed
                };
                loadId = ResolveLoadId(resolveContext, loadIndex);
            }
        }

        if (string.IsNullOrEmpty(loadId))
        {
            await SendTtsMessageAsync(userId, "I could not find that load. Try listing loads again.", cancellationToken);
            return;
        }

        FreightLoadDto? load = null;
        if (loadIndex >= 1 && loadIndex <= resolveContext.ProposedLoads.Count)
        {
            load = resolveContext.ProposedLoads[loadIndex - 1];
        }

        var summary = !string.IsNullOrWhiteSpace(proposalMessage)
            ? proposalMessage.Trim()
            : load != null
                ? $"Load {loadIndex}: {load.OriginCity} to {load.DestCity}, {load.Currency} {load.RateAmount}."
                : $"Load option {loadIndex}.";

        var pending = new PendingAction
        {
            Type = "accept_load",
            LoadId = loadId,
            OneBasedIndex = loadIndex,
            SummaryText = summary
        };

        await _pendingActionStore.SetAsync(userId, pending, cancellationToken);
        await SendActionProposalAsync(userId, pending, cancellationToken);
        var question = !string.IsNullOrWhiteSpace(proposalMessage)
            ? proposalMessage.Trim()
            : $"{summary} Do you want to accept this load? Say yes to confirm or no to cancel.";
        await SendTtsMessageAsync(userId, question, cancellationToken);
    }

    private async Task HandleSetRouteAsync(
        string userId,
        string? destCity,
        decimal? weightKg,
        decimal? volumeM3,
        string? originCity,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(destCity) || !weightKg.HasValue || !volumeM3.HasValue)
        {
            await SendTtsMessageAsync(
                userId,
                "I need a destination, weight in kilograms, and volume in cubic meters to set your route.",
                cancellationToken);
            return;
        }

        var route = await _routeLoadsService.StartMonitoringAsync(
            userId,
            destCity.Trim(),
            weightKg.Value,
            volumeM3.Value,
            string.IsNullOrWhiteSpace(originCity) ? null : originCity.Trim(),
            cancellationToken);

        if (route != null)
        {
            await SendTtsMessageAsync(
                userId,
                $"Route set: monitoring {route.OriginCity} to {route.DestCity}.",
                cancellationToken,
                route);
        }
        else
        {
            await SendTtsMessageAsync(userId, "Could not update your route. Please try again.", cancellationToken);
        }
    }

    private async Task SendActionProposalAsync(string userId, PendingAction pending, CancellationToken cancellationToken)
    {
        try
        {
            var payload = new
            {
                type = "action_proposal",
                data = new
                {
                    action_type = pending.Type,
                    load_id = pending.LoadId,
                    one_based_index = pending.OneBasedIndex,
                    summary_text = pending.SummaryText,
                    expires_at = pending.ExpiresAt?.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)
                },
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)
            };
            var messageJson = JsonSerializer.Serialize(payload);
            await _hubContext.Clients.Group(userId).SendAsync("ReceiveMessage", messageJson, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send action_proposal to user {UserId}", userId);
        }
    }

    private static string? ResolveLoadId(RouteLoadsContext ctx, int loadIndex)
    {
        if (loadIndex < 1 || loadIndex > ctx.ProposedLoads.Count)
        {
            return null;
        }

        var id = ctx.ProposedLoads[loadIndex - 1].Id;
        return string.IsNullOrEmpty(id) ? null : id;
    }

    private static int? TryGetInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el))
        {
            return null;
        }

        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var i))
        {
            return i;
        }

        if (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var j))
        {
            return j;
        }

        return null;
    }

    private static decimal? TryGetDecimal(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el))
        {
            return null;
        }

        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d))
        {
            return d;
        }

        if (el.ValueKind == JsonValueKind.String &&
            decimal.TryParse(el.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var p))
        {
            return p;
        }

        return null;
    }

    private static string? TryGetString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return el.GetString();
    }

    private static RouteLoadsContext MergeContexts(RouteLoadsContext server, RouteLoadsContext mobile)
    {
        return new RouteLoadsContext
        {
            ActiveRoute = server.ActiveRoute ?? mobile.ActiveRoute,
            ProposedLoads = server.ProposedLoads.Count > 0 ? server.ProposedLoads : mobile.ProposedLoads
        };
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

    private async Task SendTtsMessageAsync(
        string userId,
        string message,
        CancellationToken cancellationToken,
        ActiveRouteDto? activeRoute = null)
    {
        try
        {
            object data = activeRoute != null
                ? new { message, original_query = (string?)null, active_route = activeRoute }
                : new { message, original_query = (string?)null };

            var responseMessage = new
            {
                type = "ai_response",
                data,
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)
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

