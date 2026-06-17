using System.Text.Json.Serialization;

namespace VibeDrive.Api.Models;

public class DriverLoadsPayload
{
    [JsonPropertyName("loads")]
    public List<FreightLoadDto>? Loads { get; set; }
}
