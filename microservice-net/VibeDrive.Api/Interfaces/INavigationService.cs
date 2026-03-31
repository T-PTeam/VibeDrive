using VibeDrive.Api.Models.Navigation;

namespace VibeDrive.Api.Interfaces;

public interface INavigationService
{
    Task<GeocodeResult?> GeocodeAsync(string query, CancellationToken cancellationToken = default);
    Task<RouteResult?> GetRouteAsync(RouteRequest request, CancellationToken cancellationToken = default);
}

