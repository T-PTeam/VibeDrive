using VibeDrive.Api.Interfaces;

namespace VibeDrive.Api.Services;

public class ConnectionManager : IConnectionManager
{
    private readonly Dictionary<string, string> _connectionIdToUserId = new();
    private readonly Dictionary<string, HashSet<string>> _userIdToConnectionIds = new();
    private readonly object _lock = new();

    public void AddConnection(string connectionId, string userId)
    {
        lock (_lock)
        {
            _connectionIdToUserId[connectionId] = userId;
            
            if (!_userIdToConnectionIds.ContainsKey(userId))
            {
                _userIdToConnectionIds[userId] = new HashSet<string>();
            }
            
            _userIdToConnectionIds[userId].Add(connectionId);
        }
    }

    public void RemoveConnection(string connectionId)
    {
        lock (_lock)
        {
            if (_connectionIdToUserId.TryGetValue(connectionId, out var userId))
            {
                _connectionIdToUserId.Remove(connectionId);
                
                if (_userIdToConnectionIds.ContainsKey(userId))
                {
                    _userIdToConnectionIds[userId].Remove(connectionId);
                    
                    if (_userIdToConnectionIds[userId].Count == 0)
                    {
                        _userIdToConnectionIds.Remove(userId);
                    }
                }
            }
        }
    }

    public string? GetUserId(string connectionId)
    {
        lock (_lock)
        {
            return _connectionIdToUserId.TryGetValue(connectionId, out var userId) ? userId : null;
        }
    }

    public IEnumerable<string> GetConnectionIds(string userId)
    {
        lock (_lock)
        {
            return _userIdToConnectionIds.TryGetValue(userId, out var connectionIds) 
                ? connectionIds.ToList() 
                : Enumerable.Empty<string>();
        }
    }
}

