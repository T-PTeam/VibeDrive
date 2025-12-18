using Microsoft.AspNetCore.SignalR;
using VibeDrive.Api.Interfaces;

namespace VibeDrive.Api.Hubs;

public class DriverHub : Hub
{
    private readonly IConnectionManager _connectionManager;
    private readonly ILogger<DriverHub> _logger;

    public DriverHub(IConnectionManager connectionManager, ILogger<DriverHub> logger)
    {
        _connectionManager = connectionManager;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var httpContext = Context.GetHttpContext();
        if (httpContext == null)
        {
            _logger.LogWarning("Connection attempt without HTTP context");
            await base.OnConnectedAsync();
            return;
        }

        var userId = ExtractUserId(httpContext);
        
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("Connection attempt without UserId. ConnectionId: {ConnectionId}", Context.ConnectionId);
            await base.OnConnectedAsync();
            return;
        }

        _connectionManager.AddConnection(Context.ConnectionId, userId);
        await Groups.AddToGroupAsync(Context.ConnectionId, userId);
        
        _logger.LogInformation("Driver connected. UserId: {UserId}, ConnectionId: {ConnectionId}", userId, Context.ConnectionId);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = _connectionManager.GetUserId(Context.ConnectionId);
        
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, userId);
            _connectionManager.RemoveConnection(Context.ConnectionId);
            
            _logger.LogInformation("Driver disconnected. UserId: {UserId}, ConnectionId: {ConnectionId}", userId, Context.ConnectionId);
        }

        if (exception != null)
        {
            _logger.LogError(exception, "Driver disconnected with error. ConnectionId: {ConnectionId}", Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task ReceiveMessage(string message)
    {
        await Clients.Caller.SendAsync("ReceiveMessage", message);
    }

    private static string? ExtractUserId(HttpContext httpContext)
    {
        var userId = httpContext.Request.Query["userId"].ToString();
        
        if (string.IsNullOrEmpty(userId))
        {
            userId = httpContext.Request.Headers["X-UserId"].ToString();
        }

        if (string.IsNullOrEmpty(userId))
        {
            userId = httpContext.Request.Headers["UserId"].ToString();
        }

        return string.IsNullOrEmpty(userId) ? null : userId;
    }
}

