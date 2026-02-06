using System.Text;
using System.Text.Json;
using VibeDrive.Api.Interfaces;

namespace VibeDrive.Api.Services;

public class OpenAIService : IOpenAIService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly ILogger<OpenAIService> _logger;
    private const string TranscriptionUrl = "https://api.openai.com/v1/audio/transcriptions";
    private const string ChatUrl = "https://api.openai.com/v1/chat/completions";
    private const string SpeechUrl = "https://api.openai.com/v1/audio/speech";

    public OpenAIService(string apiKey, ILogger<OpenAIService> logger, HttpClient httpClient)
    {
        _apiKey = apiKey;
        _logger = logger;
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromMinutes(5);
    }

    public async Task<string?> TranscribeAudioAsync(byte[] audioData, string filename, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("OpenAI API key is not configured. Skipping transcription.");
            return null;
        }

        try
        {
            _logger.LogInformation("Starting audio transcription - Filename: {Filename}, Size: {Size} bytes", filename, audioData.Length);

            using var content = new MultipartFormDataContent();
            using var audioStream = new MemoryStream(audioData);
            using var audioContent = new StreamContent(audioStream);
            
            audioContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/m4a");
            content.Add(audioContent, "file", filename);
            content.Add(new StringContent("whisper-1"), "model");

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");

            var response = await _httpClient.PostAsync(TranscriptionUrl, content, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("OpenAI API returned error - Status: {StatusCode}, Error: {Error}", response.StatusCode, errorContent);
                return null;
            }

            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
            var responseJson = JsonDocument.Parse(responseContent);
            
            if (!responseJson.RootElement.TryGetProperty("text", out var textElement))
            {
                _logger.LogWarning("OpenAI API response missing 'text' property. Response: {Response}", responseContent);
                return null;
            }

            var transcription = textElement.GetString();

            if (string.IsNullOrWhiteSpace(transcription))
            {
                _logger.LogWarning("Audio transcription returned empty result for filename: {Filename}", filename);
                return null;
            }

            _logger.LogInformation("Audio transcription completed - Filename: {Filename}, Transcription: {Transcription}", filename, transcription);

            return transcription;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to transcribe audio - Filename: {Filename}", filename);
            throw;
        }
    }

    public async Task<string?> ProcessTranscriptionAsync(string transcription, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("OpenAI API key is not configured. Skipping transcription processing.");
            return null;
        }

        try
        {
            var systemPrompt = @"You are a voice command processor for a driving app. Analyze the user's voice transcription and determine if they want to:
1. Play music on Spotify - respond with JSON: {""action"":""play_music"",""query"":""song, artist, genre, or playlist request""}
2. Get a response/answer - respond with JSON: {""action"":""respond"",""query"":""the question or request""}
3. Other commands - respond with JSON: {""action"":""other"",""query"":""original text""}

Examples:
- ""play Imagine Dragons"" -> {""action"":""play_music"",""query"":""Imagine Dragons""}
- ""play music"" -> {""action"":""play_music"",""query"":""music""}
- ""open metal music"" -> {""action"":""play_music"",""query"":""metal music""}
- ""start some lo-fi"" -> {""action"":""play_music"",""query"":""lo-fi""}
- ""hello"" -> {""action"":""respond"",""query"":""hello""}
- ""what's the weather"" -> {""action"":""respond"",""query"":""what's the weather""}

Always respond with valid JSON only, no other text.";

            var requestBody = new
            {
                model = "gpt-4o-mini",
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = transcription }
                },
                temperature = 0.3,
                max_tokens = 150
            };

            var jsonContent = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");

            var response = await _httpClient.PostAsync(ChatUrl, content, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("OpenAI Chat API returned error - Status: {StatusCode}, Error: {Error}", response.StatusCode, errorContent);
                return null;
            }

            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
            var responseJson = JsonDocument.Parse(responseContent);

            if (!responseJson.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
            {
                _logger.LogWarning("OpenAI Chat API response missing choices. Response: {Response}", responseContent);
                return null;
            }

            var message = choices[0].GetProperty("message").GetProperty("content").GetString();
            _logger.LogInformation("Transcription processed - Transcription: {Transcription}, Command: {Command}", transcription, message);

            return message;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process transcription - Transcription: {Transcription}", transcription);
            return null;
        }
    }

    public async Task<string?> GenerateResponseAsync(string userMessage, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("OpenAI API key is not configured. Skipping response generation.");
            return null;
        }

        try
        {
            var systemPrompt = @"You are a helpful voice assistant for a driving app. Provide brief, conversational responses to user questions and requests. Keep responses short and friendly.";

            var requestBody = new
            {
                model = "gpt-4o-mini",
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userMessage }
                },
                temperature = 0.7,
                max_tokens = 200
            };

            var jsonContent = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");

            var response = await _httpClient.PostAsync(ChatUrl, content, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("OpenAI Chat API returned error - Status: {StatusCode}, Error: {Error}", response.StatusCode, errorContent);
                return null;
            }

            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
            var responseJson = JsonDocument.Parse(responseContent);

            if (!responseJson.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
            {
                _logger.LogWarning("OpenAI Chat API response missing choices. Response: {Response}", responseContent);
                return null;
            }

            var aiResponse = choices[0].GetProperty("message").GetProperty("content").GetString();
            _logger.LogInformation("AI response generated - User: {UserMessage}, Response: {Response}", userMessage, aiResponse);

            return aiResponse;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate AI response - UserMessage: {UserMessage}", userMessage);
            return null;
        }
    }

    public async Task<byte[]?> GenerateSpeechAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("OpenAI API key is not configured. Skipping speech generation.");
            return null;
        }

        try
        {
            var requestBody = new
            {
                model = "tts-1",
                input = text,
                voice = "alloy",
                response_format = "mp3"
            };

            var jsonContent = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");

            var response = await _httpClient.PostAsync(SpeechUrl, content, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("OpenAI Speech API returned error - Status: {StatusCode}, Error: {Error}", response.StatusCode, errorContent);
                return null;
            }

            var audioBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            _logger.LogInformation("Speech generated - Text: {Text}, AudioSize: {Size} bytes", text, audioBytes.Length);

            return audioBytes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate speech - Text: {Text}", text);
            return null;
        }
    }
}

