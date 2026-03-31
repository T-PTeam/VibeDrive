using VibeDrive.Api.Models;

namespace VibeDrive.Api.Interfaces;

public interface IPendingActionStore
{
    Task<PendingAction?> GetAsync(string userId, CancellationToken cancellationToken = default);

    Task SetAsync(string userId, PendingAction pendingAction, CancellationToken cancellationToken = default);

    Task ClearAsync(string userId, CancellationToken cancellationToken = default);
}
