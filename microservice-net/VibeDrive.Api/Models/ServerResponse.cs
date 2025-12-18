namespace VibeDrive.Api.Models;

public class ServerResponse<T>
{
    [System.Text.Json.Serialization.JsonPropertyName("status")]
    public string Status { get; set; } = "success";

    [System.Text.Json.Serialization.JsonPropertyName("code")]
    public int Code { get; set; } = 200;

    [System.Text.Json.Serialization.JsonPropertyName("data")]
    public T? Data { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("message")]
    public string? Message { get; set; }

    public static ServerResponse<T> Success(T data, string? message = null)
    {
        return new ServerResponse<T>
        {
            Status = "success",
            Code = 200,
            Data = data,
            Message = message
        };
    }

    public static ServerResponse<T> Error(string message, int code = 400)
    {
        return new ServerResponse<T>
        {
            Status = "error",
            Code = code,
            Data = default,
            Message = message
        };
    }
}

