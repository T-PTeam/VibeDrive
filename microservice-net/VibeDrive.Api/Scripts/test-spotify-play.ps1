param(
    [Parameter(Mandatory=$false)]
    [string]$UserId = "driver123",
    
    [Parameter(Mandatory=$false)]
    [string]$TrackUri = "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
    
    [Parameter(Mandatory=$false)]
    [string]$TrackId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Query = "",
    
    [Parameter(Mandatory=$false)]
    [string]$RedisHost = "localhost",
    
    [Parameter(Mandatory=$false)]
    [int]$RedisPort = 6379
)

Write-Host "Testing Spotify play_music command..." -ForegroundColor Yellow
Write-Host "User ID: $UserId" -ForegroundColor Cyan

$trackData = @{}

if ($TrackId) {
    $trackData.track_id = $TrackId
    Write-Host "Track ID: $TrackId" -ForegroundColor Cyan
} elseif ($Query) {
    $trackData.query = $Query
    Write-Host "Search Query: $Query" -ForegroundColor Cyan
} else {
    $trackData.uri = $TrackUri
    Write-Host "Track URI: $TrackUri" -ForegroundColor Cyan
}

$messageJson = @{
    userId = $UserId
    type = "play_music"
    data = $trackData
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json -Compress

Write-Host "Publishing to Redis..." -ForegroundColor Yellow
$messageJson | wsl redis-cli -h $RedisHost -p $RedisPort PUBLISH driver_updates

Write-Host "Message published!" -ForegroundColor Green
Write-Host "JSON: $messageJson" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected behavior:" -ForegroundColor Yellow
Write-Host "1. Mobile app receives play_music command via SignalR" -ForegroundColor White
Write-Host "2. Spotify app should open and play the track" -ForegroundColor White

