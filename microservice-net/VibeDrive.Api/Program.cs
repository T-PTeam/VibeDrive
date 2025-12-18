using StackExchange.Redis;
using System.Text.Json;
using System.Text.Json.Serialization;
using VibeDrive.Api.Hubs;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<HostOptions>(options =>
{
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore;
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var redisConnectionString = builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
{
    var configuration = ConfigurationOptions.Parse(redisConnectionString);
    configuration.AbortOnConnectFail = false;
    configuration.ConnectRetry = 10;
    configuration.ConnectTimeout = 10000;
    configuration.ReconnectRetryPolicy = new ExponentialRetry(1000, 30000);
    configuration.AsyncTimeout = 10000;
    configuration.SyncTimeout = 10000;
    return ConnectionMultiplexer.Connect(configuration);
});

builder.Services.AddSingleton<IConnectionManager, ConnectionManager>();

builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
});

builder.Services.AddHostedService<RedisListenerService>();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() 
    ?? Array.Empty<string>();

if (builder.Environment.IsDevelopment())
{
    var developmentOrigins = new List<string>(allowedOrigins)
    {
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://10.0.2.2:5009",
        "http://10.0.2.2:7217"
    };

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowMobileApp", policy =>
        {
            policy.WithOrigins(developmentOrigins.ToArray())
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials()
                  .WithExposedHeaders("Content-Disposition");
        });
    });
}
else
{
    if (allowedOrigins.Length == 0)
    {
        throw new InvalidOperationException(
            "Cors:AllowedOrigins must be configured in production environment");
    }

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowMobileApp", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials()
                  .WithExposedHeaders("Content-Disposition");
        });
    });
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseCors("AllowMobileApp");

app.MapControllers();

app.MapHub<DriverHub>("/driverhub");

app.Run();
