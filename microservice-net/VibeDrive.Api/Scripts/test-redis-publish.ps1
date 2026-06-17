param(
    [Parameter(Mandatory=$false)]
    [string]$UserId = "driver123",
    
    [Parameter(Mandatory=$false)]
    [string]$Message = "Test message from PowerShell",
    
    [Parameter(Mandatory=$false)]
    [string]$RedisHost = "localhost",
    
    [Parameter(Mandatory=$false)]
    [int]$RedisPort = 6379
)

Write-Host "Publishing message to Redis..." -ForegroundColor Yellow
Write-Host "User ID: $UserId" -ForegroundColor Cyan
Write-Host "Message: $Message" -ForegroundColor Cyan

$messageJson = @{
    userId = $UserId
    type = "test"
    data = $Message
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json -Compress

$messageJson | wsl redis-cli -h $RedisHost -p $RedisPort PUBLISH driver_updates

Write-Host "Message published!" -ForegroundColor Green
Write-Host "JSON: $messageJson" -ForegroundColor Gray

