using Microsoft.AspNetCore.Mvc;
using VibeDrive.Api.Converters;
using VibeDrive.Api.Models;
using System.Text.Json.Serialization;
using StackExchange.Redis;
using System.Text.Json;

namespace VibeDrive.Api.Controllers;

[ApiController]
[Route("api/v1")]
public class DriverController : ControllerBase
{
    private readonly IConnectionMultiplexer _redis;

    public DriverController(IConnectionMultiplexer redis)
    {
        _redis = redis;
    }
    [HttpGet("driver_profile/{id}")]
    public IActionResult GetProfile(int id)
    {
        var profile = new DriverProfileDto
        {
            Id = id,
            DriverName = "John Doe",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        return Ok(ServerResponse<DriverProfileDto>.Success(profile));
    }

    [HttpGet("rides")]
    public IActionResult GetRides(
        [FromQuery(Name = "sort_by")] string? sortBy,
        [FromQuery(Name = "dir")] string? direction,
        [FromQuery(Name = "driver_id")] int? driverId)
    {
        var rides = new List<RideDto>
        {
            new RideDto
            {
                RideId = 1,
                DriverId = driverId ?? 123,
                PickupLocation = "123 Main St",
                Destination = "456 Oak Ave",
                Fare = 25.50,
                CreatedAt = DateTime.UtcNow
            }
        };

        return Ok(ServerResponse<List<RideDto>>.Success(rides));
    }

    [HttpPost("rides")]
    public IActionResult CreateRide([FromBody] CreateRideDto dto)
    {
        var ride = new RideDto
        {
            RideId = 999,
            DriverId = dto.DriverId,
            PickupLocation = dto.PickupLocation,
            Destination = dto.Destination,
            Fare = dto.Fare,
            CreatedAt = DateTime.UtcNow
        };

        return Ok(ServerResponse<RideDto>.Success(ride, "Ride created successfully"));
    }

    [HttpPost("redis/publish")]
    public async Task<IActionResult> PublishToRedis([FromBody] RedisPublishRequest request)
    {
        try
        {
            var subscriber = _redis.GetSubscriber();
            var result = await subscriber.PublishAsync(request.Channel, request.Message);
            
            return Ok(ServerResponse<object>.Success(new { subscribers = result }, "Message published to Redis"));
        }
        catch (Exception ex)
        {
            return StatusCode(500, ServerResponse<object>.Error($"Failed to publish to Redis: {ex.Message}"));
        }
    }
}

public class RedisPublishRequest
{
    [JsonPropertyName("channel")]
    public string Channel { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}

public class DriverProfileDto
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("driver_name")]
    public string DriverName { get; set; } = string.Empty;

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("created_at")]
    [JsonConverter(typeof(ServerDateTimeConverter))]
    public DateTime CreatedAt { get; set; }
}

public class RideDto
{
    [JsonPropertyName("ride_id")]
    public int RideId { get; set; }

    [JsonPropertyName("driver_id")]
    public int DriverId { get; set; }

    [JsonPropertyName("pickup_location")]
    public string PickupLocation { get; set; } = string.Empty;

    [JsonPropertyName("destination")]
    public string Destination { get; set; } = string.Empty;

    [JsonPropertyName("fare")]
    public double Fare { get; set; }

    [JsonPropertyName("created_at")]
    [JsonConverter(typeof(ServerDateTimeConverter))]
    public DateTime CreatedAt { get; set; }
}

public class CreateRideDto
{
    [JsonPropertyName("driver_id")]
    [JsonConverter(typeof(StringToIntConverter))]
    public int DriverId { get; set; }

    [JsonPropertyName("pickup_location")]
    public string PickupLocation { get; set; } = string.Empty;

    [JsonPropertyName("destination")]
    public string Destination { get; set; } = string.Empty;

    [JsonPropertyName("fare")]
    [JsonConverter(typeof(StringToDoubleConverter))]
    public double Fare { get; set; }
}

