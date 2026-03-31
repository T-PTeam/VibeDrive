using System.Text.Json.Serialization;

namespace VibeDrive.Api.Models;

public class RouteSetupParseDto
{
    [JsonPropertyName("dest_city")]
    public string? DestCity { get; set; }

    [JsonPropertyName("weight_kg")]
    public double? WeightKg { get; set; }

    [JsonPropertyName("volume_m3")]
    public double? VolumeM3 { get; set; }

    [JsonPropertyName("ai_message")]
    public string? AiMessage { get; set; }
}
