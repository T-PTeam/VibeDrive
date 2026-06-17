namespace VibeDrive.Api.Interfaces;

public interface IConnectionManager
{
    void AddConnection(string connectionId, string userId);
    void RemoveConnection(string connectionId);
    string? GetUserId(string connectionId);
    IEnumerable<string> GetConnectionIds(string userId);
}

