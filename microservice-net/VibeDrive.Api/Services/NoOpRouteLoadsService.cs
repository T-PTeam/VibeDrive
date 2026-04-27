using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models;

namespace VibeDrive.Api.Services;

[Obsolete("Replaced by RouteLoadsService. Kept temporarily for reference.")]
public class NoOpRouteLoadsService : IRouteLoadsService
{
    public Task<ActiveRouteDto?> GetActiveRouteAsync(string driverId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<ActiveRouteDto?>(null);
    }

    public Task<IReadOnlyList<FreightLoadDto>> GetProposedLoadsAsync(string driverId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IReadOnlyList<FreightLoadDto>>(Array.Empty<FreightLoadDto>());
    }

    public Task<RouteLoadsContext> GetContextAsync(string driverId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new RouteLoadsContext());
    }

    public Task<ActiveRouteDto?> StartMonitoringAsync(string driverId, string destCity, decimal weightKg, decimal volumeM3, string? originCity = null, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<ActiveRouteDto?>(null);
    }

    public Task<ActiveRouteDto?> AcceptLoadByIdAsync(string driverId, string loadId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<ActiveRouteDto?>(null);
    }

    public Task<ActiveRouteDto?> AcceptLoadByIndexAsync(string driverId, int oneBasedIndex, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<ActiveRouteDto?>(null);
    }
}
