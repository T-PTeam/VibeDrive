using System.Text.Json;
using System.Text.Json.Serialization;

namespace VibeDrive.Api.Converters;

public class ServerDateTimeConverter : JsonConverter<DateTime>
{
    private const string ServerDateFormat = "yyyy-MM-dd HH:mm:ss";
    private const string ServerDateFormatWithTimezone = "yyyy-MM-dd HH:mm:ss zzz";

    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var stringValue = reader.GetString();
            if (string.IsNullOrWhiteSpace(stringValue))
                return default;

            if (DateTime.TryParseExact(stringValue, ServerDateFormat, null, System.Globalization.DateTimeStyles.None, out var dateTime))
                return dateTime;

            if (DateTime.TryParseExact(stringValue, ServerDateFormatWithTimezone, null, System.Globalization.DateTimeStyles.None, out var dateTimeWithTz))
                return dateTimeWithTz;

            if (DateTime.TryParse(stringValue, out var parsed))
                return parsed;
        }

        return default;
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var formatted = value.ToString(ServerDateFormat);
        writer.WriteStringValue(formatted);
    }
}

