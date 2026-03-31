using StackExchange.Redis;
using VibeDrive.Api.Hubs;
using VibeDrive.Api.Interfaces;
using VibeDrive.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<HostOptions>(options =>
{
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore;
});

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

builder.Services.AddSingleton<IRouteLoadsService, NoOpRouteLoadsService>();

builder.Services.AddHttpClient();

var openAIApiKey = builder.Configuration["OpenAI:ApiKey"] 
    ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY") 
    ?? string.Empty;
builder.Services.AddSingleton<IOpenAIService>(sp =>
{
    var logger = sp.GetRequiredService<ILogger<OpenAIService>>();
    var httpClientFactory = sp.GetRequiredService<IHttpClientFactory>();
    var httpClient = httpClientFactory.CreateClient();
    return new OpenAIService(openAIApiKey, logger, httpClient);
});

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
        "http://10.0.2.2:7217",
        "http://31.43.51.42:5009",
        "http://31.43.51.42:7217",
        "http://192.168.0.155:5009",
        "http://192.168.0.155:7217"
    };

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowMobileApp", policy =>
        {
            policy.SetIsOriginAllowed(origin => true)
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

var urls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "";
if (!string.IsNullOrEmpty(urls) && urls.Contains("https://"))
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles();

app.UseCors("AllowMobileApp");

app.MapHub<DriverHub>("/driverhub");

app.Run();
