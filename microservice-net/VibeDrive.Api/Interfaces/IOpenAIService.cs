using VibeDrive.Api.Models;

namespace VibeDrive.Api.Interfaces;

public interface IOpenAIService
{
    Task<string?> TranscribeAudioAsync(byte[] audioData, string filename, CancellationToken cancellationToken = default);
    Task<string?> ProcessTranscriptionAsync(string transcription, CancellationToken cancellationToken = default);
    Task<string?> ProcessTranscriptionWithContextAsync(string transcription, RouteLoadsContext context, CancellationToken cancellationToken = default);
    Task<string?> GenerateResponseAsync(string userMessage, CancellationToken cancellationToken = default);
    Task<byte[]?> GenerateSpeechAsync(string text, CancellationToken cancellationToken = default);
}

public class TranscriptionCommand
{
    public string? Action { get; set; }
    public string? Query { get; set; }
    public bool ShouldPlayMusic { get; set; }
    public bool ShouldRespond { get; set; }
}

