using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models;
namespace VibeDrive.Api.Services;

public class RouteLoadsService : IRouteLoadsService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<RouteLoadsService> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public RouteLoadsService(HttpClient httpClient, ILogger<RouteLoadsService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<ActiveRouteDto?> GetActiveRouteAsync(string driverId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"v1/driver/route?user_id={Uri.EscapeDataString(driverId)}",
                cancellationToken).ConfigureAwait(false);

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("GetActiveRoute failed {Status}", response.StatusCode);
                return null;
            }

            var envelope = await response.Content.ReadFromJsonAsync<ServerResponse<ActiveRouteDto>>(JsonOptions, cancellationToken)
                .ConfigureAwait(false);
            if (envelope is not { Status: "success" } || envelope.Data == null)
            {
                return null;
            }

            return envelope.Data;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetActiveRoute error for {DriverId}", driverId);
            return null;
        }
    }

    public async Task<IReadOnlyList<FreightLoadDto>> GetProposedLoadsAsync(string driverId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"v1/driver/loads?user_id={Uri.EscapeDataString(driverId)}",
                cancellationToken).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("GetProposedLoads failed {Status}", response.StatusCode);
                return Array.Empty<FreightLoadDto>();
            }

            var envelope = await response.Content.ReadFromJsonAsync<ServerResponse<DriverLoadsPayload>>(JsonOptions, cancellationToken)
                .ConfigureAwait(false);
            if (envelope is not { Status: "success" } || envelope.Data?.Loads == null)
            {
                return Array.Empty<FreightLoadDto>();
            }

            return envelope.Data.Loads;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetProposedLoads error for {DriverId}", driverId);
            return Array.Empty<FreightLoadDto>();
        }
    }

    public async Task<RouteLoadsContext> GetContextAsync(string driverId, CancellationToken cancellationToken = default)
    {
        var routeTask = GetActiveRouteAsync(driverId, cancellationToken);
        var loadsTask = GetProposedLoadsAsync(driverId, cancellationToken);
        await Task.WhenAll(routeTask, loadsTask).ConfigureAwait(false);
        return new RouteLoadsContext
        {
            ActiveRoute = await routeTask.ConfigureAwait(false),
            ProposedLoads = await loadsTask.ConfigureAwait(false)
        };
    }

    public async Task<ActiveRouteDto?> StartMonitoringAsync(
        string driverId,
        string destCity,
        decimal weightKg,
        decimal volumeM3,
        string? originCity = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var body = new
            {
                user_id = driverId,
                dest_city = destCity,
                weight_kg = weightKg,
                volume_m3 = volumeM3,
                origin_city = originCity
            };

            var response = await _httpClient.PostAsJsonAsync("v1/driver/route", body, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("StartMonitoring failed {Status}", response.StatusCode);
                return null;
            }

            var envelope = await response.Content.ReadFromJsonAsync<ServerResponse<ActiveRouteDto>>(JsonOptions, cancellationToken)
                .ConfigureAwait(false);
            if (envelope is not { Status: "success" })
            {
                return null;
            }

            return envelope.Data;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "StartMonitoring error for {DriverId}", driverId);
            return null;
        }
    }

    public async Task<ActiveRouteDto?> AcceptLoadByIdAsync(string driverId, string loadId, CancellationToken cancellationToken = default)
    {
        try
        {
            var body = new { user_id = driverId, load_id = loadId };
            var response = await _httpClient.PostAsJsonAsync("v1/driver/loads/accept", body, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("AcceptLoad failed {Status}", response.StatusCode);
                return null;
            }

            var envelope = await response.Content.ReadFromJsonAsync<ServerResponse<ActiveRouteDto>>(JsonOptions, cancellationToken)
                .ConfigureAwait(false);
            if (envelope is not { Status: "success" })
            {
                return null;
            }

            return envelope.Data;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AcceptLoadById error for {DriverId}", driverId);
            return null;
        }
    }

    public async Task<ActiveRouteDto?> AcceptLoadByIndexAsync(string driverId, int oneBasedIndex, CancellationToken cancellationToken = default)
    {
        var loads = await GetProposedLoadsAsync(driverId, cancellationToken).ConfigureAwait(false);
        if (oneBasedIndex < 1 || oneBasedIndex > loads.Count)
        {
            return null;
        }

        var load = loads[oneBasedIndex - 1];
        if (string.IsNullOrEmpty(load.Id))
        {
            return null;
        }

        return await AcceptLoadByIdAsync(driverId, load.Id, cancellationToken).ConfigureAwait(false);
    }
}
