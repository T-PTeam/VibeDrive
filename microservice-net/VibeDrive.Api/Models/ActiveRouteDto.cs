using System.Text.Json.Serialization;

namespace VibeDrive.Api.Models;

public class ActiveRouteDto
{
    [JsonPropertyName("driver_id")]
    public string DriverId { get; set; } = string.Empty;

    [JsonPropertyName("origin_city")]
    public string OriginCity { get; set; } = string.Empty;

    [JsonPropertyName("dest_city")]
    public string DestCity { get; set; } = string.Empty;

    [JsonPropertyName("weight_kg")]
    public decimal WeightKg { get; set; }

    [JsonPropertyName("volume_m3")]
    public decimal VolumeM3 { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "active";

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
