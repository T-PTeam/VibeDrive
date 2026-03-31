using System.Globalization;
using System.Text.Json;
using System.Web;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models.Navigation;

namespace VibeDrive.Api.Services;

public class MapboxNavigationService : INavigationService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MapboxNavigationService> _logger;
    private readonly string _accessToken;

    public MapboxNavigationService(
        HttpClient httpClient,
        ILogger<MapboxNavigationService> logger,
        IConfiguration config)
    {
        _httpClient = httpClient;
        _logger = logger;
        _accessToken =
            config["Mapbox:AccessToken"] ??
            Environment.GetEnvironmentVariable("MAPBOX_ACCESS_TOKEN") ??
            string.Empty;
    }

    public async Task<GeocodeResult?> GeocodeAsync(string query, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query)) return null;
        if (string.IsNullOrWhiteSpace(_accessToken))
        {
            _logger.LogWarning("Mapbox access token not configured. Skipping geocode.");
            return null;
        }

        var encoded = HttpUtility.UrlEncode(query.Trim());
        var url =
            $"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded}.json?access_token={_accessToken}&limit=1";

        using var res = await _httpClient.GetAsync(url, cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("Mapbox geocode failed. Status={Status} Body={Body}", (int)res.StatusCode, body);
            return null;
        }

        var json = await res.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("features", out var features) || features.GetArrayLength() == 0)
        {
            return null;
        }

        var feature = features[0];
        var placeName = feature.TryGetProperty("place_name", out var pn) ? pn.GetString() : null;
        if (!feature.TryGetProperty("center", out var center) || center.ValueKind != JsonValueKind.Array || center.GetArrayLength() < 2)
        {
            return null;
        }

        var lon = center[0].GetDouble();
        var lat = center[1].GetDouble();

        return new GeocodeResult
        {
            Query = query.Trim(),
            Formatted = placeName ?? query.Trim(),
            Latitude = lat,
            Longitude = lon,
        };
    }

    public async Task<RouteResult?> GetRouteAsync(RouteRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.OriginQuery) || string.IsNullOrWhiteSpace(request.DestQuery))
        {
            return null;
        }

        var origin = await GeocodeAsync(request.OriginQuery, cancellationToken);
        var dest = await GeocodeAsync(request.DestQuery, cancellationToken);
        if (origin == null || dest == null)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(_accessToken))
        {
            _logger.LogWarning("Mapbox access token not configured. Skipping route.");
            return null;
        }

        var originLon = origin.Longitude.ToString("G", CultureInfo.InvariantCulture);
        var originLat = origin.Latitude.ToString("G", CultureInfo.InvariantCulture);
        var destLon = dest.Longitude.ToString("G", CultureInfo.InvariantCulture);
        var destLat = dest.Latitude.ToString("G", CultureInfo.InvariantCulture);

        var url =
            $"https://api.mapbox.com/directions/v5/mapbox/driving/{originLon},{originLat};{destLon},{destLat}" +
            $"?access_token={_accessToken}&geometries=geojson&steps=true&overview=full";

        using var res = await _httpClient.GetAsync(url, cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("Mapbox route failed. Status={Status} Body={Body}", (int)res.StatusCode, body);
            return null;
        }

        var json = await res.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("routes", out var routes) || routes.GetArrayLength() == 0)
        {
            return null;
        }

        var route = routes[0];
        var distance = route.TryGetProperty("distance", out var distEl) ? distEl.GetDouble() : 0;
        var duration = route.TryGetProperty("duration", out var durEl) ? durEl.GetDouble() : 0;

        var result = new RouteResult
        {
            Origin = origin,
            Destination = dest,
            DistanceMeters = distance,
            DurationSeconds = duration,
        };

        if (route.TryGetProperty("geometry", out var geom) &&
            geom.TryGetProperty("coordinates", out var coords) &&
            coords.ValueKind == JsonValueKind.Array)
        {
            foreach (var c in coords.EnumerateArray())
            {
                if (c.ValueKind != JsonValueKind.Array || c.GetArrayLength() < 2) continue;
                result.Polyline.Add(new RoutePoint
                {
                    Longitude = c[0].GetDouble(),
                    Latitude = c[1].GetDouble(),
                });
            }
        }

        if (route.TryGetProperty("legs", out var legs) && legs.ValueKind == JsonValueKind.Array)
        {
            foreach (var leg in legs.EnumerateArray())
            {
                if (!leg.TryGetProperty("steps", out var steps) || steps.ValueKind != JsonValueKind.Array) continue;
                foreach (var step in steps.EnumerateArray())
                {
                    var instruction =
                        step.TryGetProperty("maneuver", out var man) &&
                        man.TryGetProperty("instruction", out var instr)
                            ? instr.GetString()
                            : null;

                    var stepDistance = step.TryGetProperty("distance", out var sd) ? sd.GetDouble() : 0;
                    var stepDuration = step.TryGetProperty("duration", out var sdur) ? sdur.GetDouble() : 0;

                    var start = new RoutePoint();
                    if (step.TryGetProperty("maneuver", out var man2) &&
                        man2.TryGetProperty("location", out var loc) &&
                        loc.ValueKind == JsonValueKind.Array &&
                        loc.GetArrayLength() >= 2)
                    {
                        start.Longitude = loc[0].GetDouble();
                        start.Latitude = loc[1].GetDouble();
                    }

                    var end = start;
                    if (step.TryGetProperty("geometry", out var sg) &&
                        sg.TryGetProperty("coordinates", out var sCoords) &&
                        sCoords.ValueKind == JsonValueKind.Array)
                    {
                        var last = sCoords.EnumerateArray().LastOrDefault();
                        if (last.ValueKind == JsonValueKind.Array && last.GetArrayLength() >= 2)
                        {
                            end = new RoutePoint
                            {
                                Longitude = last[0].GetDouble(),
                                Latitude = last[1].GetDouble(),
                            };
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(instruction))
                    {
                        result.Steps.Add(new RouteStep
                        {
                            Instruction = instruction,
                            DistanceMeters = stepDistance,
                            DurationSeconds = stepDuration,
                            Start = start,
                            End = end,
                        });
                    }
                }
            }
        }

        return result;
    }
}

