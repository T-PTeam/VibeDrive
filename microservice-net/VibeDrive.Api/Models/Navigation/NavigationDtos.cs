using System.Text.Json.Serialization;

namespace VibeDrive.Api.Models.Navigation;

public class GeocodeResult
{
    [JsonPropertyName("query")]
    public string Query { get; set; } = string.Empty;

    [JsonPropertyName("formatted")]
    public string Formatted { get; set; } = string.Empty;

    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }
}

public class RouteRequest
{
    [JsonPropertyName("origin_query")]
    public string OriginQuery { get; set; } = string.Empty;

    [JsonPropertyName("dest_query")]
    public string DestQuery { get; set; } = string.Empty;
}

public class RouteResult
{
    [JsonPropertyName("origin")]
    public GeocodeResult Origin { get; set; } = new();

    [JsonPropertyName("destination")]
    public GeocodeResult Destination { get; set; } = new();

    [JsonPropertyName("distance_meters")]
    public double DistanceMeters { get; set; }

    [JsonPropertyName("duration_seconds")]
    public double DurationSeconds { get; set; }

    [JsonPropertyName("polyline")]
    public List<RoutePoint> Polyline { get; set; } = new();

    [JsonPropertyName("steps")]
    public List<RouteStep> Steps { get; set; } = new();
}

public class RoutePoint
{
    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }
}

public class RouteStep
{
    [JsonPropertyName("instruction")]
    public string Instruction { get; set; } = string.Empty;

    [JsonPropertyName("distance_meters")]
    public double DistanceMeters { get; set; }

    [JsonPropertyName("duration_seconds")]
    public double DurationSeconds { get; set; }

    [JsonPropertyName("start")]
    public RoutePoint Start { get; set; } = new();

    [JsonPropertyName("end")]
    public RoutePoint End { get; set; } = new();
}

