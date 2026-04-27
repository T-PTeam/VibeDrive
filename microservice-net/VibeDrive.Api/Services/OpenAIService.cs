using System.Text;
using System.Text.Json;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Models;

namespace VibeDrive.Api.Services;

public class OpenAIService : IOpenAIService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly ILogger<OpenAIService> _logger;
    private const string TranscriptionUrl = "https://api.openai.com/v1/audio/transcriptions";
    private const string ChatUrl = "https://api.openai.com/v1/chat/completions";
    private const string SpeechUrl = "https://api.openai.com/v1/audio/speech";

    private static readonly JsonSerializerOptions RouteSetupJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

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

    public async Task<string?> ProcessTranscriptionWithContextAsync(string transcription, RouteLoadsContext context, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("OpenAI API key is not configured. Skipping transcription processing.");
            return null;
        }

        try
        {
            var contextLines = new List<string>();
            if (context.ActiveRoute != null)
            {
                contextLines.Add($"Current route: {context.ActiveRoute.OriginCity} to {context.ActiveRoute.DestCity}. Capacity: {context.ActiveRoute.WeightKg} kg, {context.ActiveRoute.VolumeM3} m³.");
            }
            else
            {
                contextLines.Add("Current route: None set.");
            }

            if (context.ProposedLoads.Count > 0)
            {
                var loadLines = context.ProposedLoads.Select((l, i) => $"{i + 1}. {l.OriginCity} to {l.DestCity}, {l.Currency} {l.RateAmount}.").ToList();
                contextLines.Add("Proposed loads: " + string.Join(" ", loadLines));
            }
            else
            {
                contextLines.Add("Proposed loads: None.");
            }

            if (context.PendingAction != null)
            {
                var p = context.PendingAction;
                contextLines.Add(
                    $"Pending confirmation waiting: type={p.Type}, load_id={p.LoadId}, index={p.OneBasedIndex?.ToString() ?? "n/a"}, summary={p.SummaryText}. User may confirm (yes) or reject (no).");
            }
            else
            {
                contextLines.Add("Pending confirmation: None.");
            }

            var contextBlock = string.Join("\n", contextLines);

            var systemPrompt = $@"You are a voice command processor for a driving app. Use this context:
{contextBlock}

Always respond with valid JSON only, no other text.

Actions and JSON shapes:
- play music: {{""action"":""play_music"",""query"":""song, artist, genre, or playlist request""}}
- general answer: {{""action"":""respond"",""query"":""the question or request""}}
- list proposed loads / search loads: {{""action"":""list_loads""}} or {{""action"":""search_loads""}} (same meaning)
- list current route: {{""action"":""list_route""}}
- propose accepting a load (does NOT accept yet; server will ask for confirmation): {{""action"":""propose_accept_load"",""load_index"":<1-based int>,""message"":""short user-facing summary asking them to confirm""}}
- user confirms previous proposal (yes, sure, go ahead): {{""action"":""confirm""}}
- user rejects previous proposal (no, cancel): {{""action"":""reject""}}
- set or update monitoring route: {{""action"":""set_route"",""dest_city"":""..."",""weight_kg"":<number>,""volume_m3"":<number>,""origin_city"":""..."" or omit origin}}. Use ""update_route"" with the same fields if they want to change route.
- cargo status (not fully supported): {{""action"":""update_cargo_status"",""query"":""what they asked""}}
- fallback: {{""action"":""other"",""query"":""original text""}}

Rules:
- Never use {{""action"":""accept_load""}}. For choosing a load by number or city, always use propose_accept_load with load_index from the proposed loads list.
- If pending confirmation exists and the user clearly affirms, return {{""action"":""confirm""}}. If they clearly deny, return {{""action"":""reject""}}.
- propose_accept_load must include load_index (1-based) and a short message.";

            var requestBody = new
            {
                model = "gpt-4o-mini",
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = transcription }
                },
                temperature = 0.3,
                max_tokens = 400
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
            _logger.LogInformation("Transcription processed with context - Transcription: {Transcription}, Command: {Command}", transcription, message);

            return message;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process transcription with context - Transcription: {Transcription}", transcription);
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

    public async Task<RouteSetupParseDto?> ParseRouteSetupFromTextAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("OpenAI API key is not configured. Skipping route setup parse.");
            return null;
        }

        try
        {
            var systemPrompt = @"You extract freight route setup from free-form user text for a driving app.
Respond with ONLY a single JSON object (no markdown, no explanation) with exactly these keys:
- dest_city: string or null — primary destination city name; include country only if needed to disambiguate.
- weight_kg: number or null — total capacity in kilograms; convert from tons (×1000), pounds (×0.453592), etc.
- volume_m3: number or null — total volume in cubic meters; convert from cubic feet (×0.0283168), liters (÷1000), etc.
- ai_message: string or null — one short sentence for the user: what you inferred, what is missing, or caveats; null or empty if nothing useful.

Use JSON null for unknown numeric or city values. Do not use empty string for numbers.";

            var requestBody = new
            {
                model = "gpt-4o-mini",
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = text }
                },
                temperature = 0.2,
                max_tokens = 300
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

            var rawMessage = choices[0].GetProperty("message").GetProperty("content").GetString();
            if (string.IsNullOrWhiteSpace(rawMessage))
            {
                _logger.LogWarning("OpenAI route setup parse returned empty content");
                return null;
            }

            var trimmed = TrimJsonMarkdown(rawMessage);
            RouteSetupParseDto? dto;
            try
            {
                dto = JsonSerializer.Deserialize<RouteSetupParseDto>(trimmed, RouteSetupJsonOptions);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to deserialize route setup JSON: {Content}", trimmed);
                return null;
            }

            if (dto == null)
            {
                return null;
            }

            _logger.LogInformation("Route setup parsed from text");
            return dto;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse route setup from text");
            return null;
        }
    }

    private static string TrimJsonMarkdown(string content)
    {
        var s = content.Trim();
        if (s.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNl = s.IndexOf('\n');
            if (firstNl >= 0)
            {
                s = s[(firstNl + 1)..];
            }

            var end = s.LastIndexOf("```", StringComparison.Ordinal);
            if (end >= 0)
            {
                s = s[..end];
            }
        }

        return s.Trim();
    }
}

