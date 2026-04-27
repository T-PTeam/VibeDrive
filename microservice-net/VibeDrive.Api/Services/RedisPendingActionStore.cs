using System.Text.Json;
using StackExchange.Redis;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models;
using VibeDrive.Api.Options;
using Microsoft.Extensions.Options;

namespace VibeDrive.Api.Services;

public class RedisPendingActionStore : IPendingActionStore
{
    private readonly IConnectionMultiplexer _redis;
    private readonly IOptions<PendingActionOptions> _options;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public RedisPendingActionStore(
        IConnectionMultiplexer redis,
        IOptions<PendingActionOptions> options)
    {
        _redis = redis;
        _options = options;
    }

    private static RedisKey Key(string userId) => new($"pending_action:{userId}");

    public async Task<PendingAction?> GetAsync(string userId, CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        var val = await db.StringGetAsync(Key(userId)).ConfigureAwait(false);
        if (!val.HasValue)
        {
            return null;
        }

        return JsonSerializer.Deserialize<PendingAction>(val!, JsonOptions);
    }

    public async Task SetAsync(string userId, PendingAction pendingAction, CancellationToken cancellationToken = default)
    {
        var ttl = TimeSpan.FromMinutes(Math.Max(1, _options.Value.TtlMinutes));
        pendingAction.CreatedAt = DateTime.UtcNow;
        pendingAction.ExpiresAt = DateTime.UtcNow + ttl;
        var json = JsonSerializer.Serialize(pendingAction, JsonOptions);
        var db = _redis.GetDatabase();
        await db.StringSetAsync(Key(userId), json, ttl).ConfigureAwait(false);
    }

    public async Task ClearAsync(string userId, CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        await db.KeyDeleteAsync(Key(userId)).ConfigureAwait(false);
    }
}
