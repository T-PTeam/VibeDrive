namespace VibeDrive.Api.Interfaces;

public interface IRedisListenerService
{
    Task StartListeningAsync(CancellationToken cancellationToken);
    Task StopListeningAsync();
}

