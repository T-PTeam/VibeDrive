using VibeDrive.Api.Models;

namespace VibeDrive.Api.Interfaces;

public interface IRouteLoadsService
{
    Task<ActiveRouteDto?> GetActiveRouteAsync(string driverId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FreightLoadDto>> GetProposedLoadsAsync(string driverId, CancellationToken cancellationToken = default);
    Task<RouteLoadsContext> GetContextAsync(string driverId, CancellationToken cancellationToken = default);
    Task<ActiveRouteDto?> StartMonitoringAsync(string driverId, string destCity, decimal weightKg, decimal volumeM3, string? originCity = null, CancellationToken cancellationToken = default);
    Task<ActiveRouteDto?> AcceptLoadByIdAsync(string driverId, string loadId, CancellationToken cancellationToken = default);
    Task<ActiveRouteDto?> AcceptLoadByIndexAsync(string driverId, int oneBasedIndex, CancellationToken cancellationToken = default);
}
