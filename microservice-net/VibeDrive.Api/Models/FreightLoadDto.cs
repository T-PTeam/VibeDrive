using System.Text.Json.Serialization;

namespace VibeDrive.Api.Models;

public class FreightLoadDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("origin_city")]
    public string OriginCity { get; set; } = string.Empty;

    [JsonPropertyName("dest_city")]
    public string DestCity { get; set; } = string.Empty;

    [JsonPropertyName("weight_kg")]
    public decimal? WeightKg { get; set; }

    [JsonPropertyName("volume_m3")]
    public decimal? VolumeM3 { get; set; }

    [JsonPropertyName("rate_amount")]
    public decimal RateAmount { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "USD";

    [JsonPropertyName("distance_km")]
    public decimal? DistanceKm { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }
}
