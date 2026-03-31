using System.Text.Json.Serialization;

namespace VibeDrive.Api.Models;

public class PendingAction
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "accept_load";

    [JsonPropertyName("load_id")]
    public string LoadId { get; set; } = string.Empty;

    [JsonPropertyName("one_based_index")]
    public int? OneBasedIndex { get; set; }

    [JsonPropertyName("summary_text")]
    public string SummaryText { get; set; } = string.Empty;

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("expires_at")]
    public DateTime? ExpiresAt { get; set; }
}
