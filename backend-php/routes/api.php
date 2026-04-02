<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\DriverRouteController;
use App\Http\Controllers\Api\UserDriverSettingsController;
use App\Http\Controllers\Api\UserLastLocationController;
use App\Services\OpenAIService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::post('/v1/driver/route/parse-setup', [DriverRouteController::class, 'parseRouteSetup']);
Route::get('/v1/driver/route', [DriverRouteController::class, 'getActiveRoute']);
Route::post('/v1/driver/route', [DriverRouteController::class, 'startMonitoring']);
Route::get('/v1/driver/loads', [DriverRouteController::class, 'getProposedLoads']);
Route::post('/v1/driver/loads/accept', [DriverRouteController::class, 'acceptLoad']);

Route::get('/v1/user/last-location', [UserLastLocationController::class, 'show']);
Route::post('/v1/user/last-location', [UserLastLocationController::class, 'store']);
Route::get('/v1/user/driver-settings', [UserDriverSettingsController::class, 'show']);
Route::get('/v1/user/tts-voice', [UserDriverSettingsController::class, 'ttsVoiceShow']);
Route::put('/v1/user/tts-voice', [UserDriverSettingsController::class, 'ttsVoiceUpdate']);

Route::get('/ping', fn () => response()->json(['ok' => true], 200));
Route::get('/openai-check', function () {
    $key = config('services.openai.api_key', '');
    $keyConfigured = $key !== '';
    if (!$keyConfigured) {
        return response()->json([
            'key_configured' => false,
            'message' => 'Set OPENAI_API_KEY in .env and run: php artisan config:clear',
        ], 200);
    }
    $response = app(OpenAIService::class)->sendPrompt('Reply with one word: OK');
    return response()->json([
        'key_configured' => true,
        'connection' => $response->success ? 'ok' : 'error',
        'message' => $response->success ? $response->content : $response->error,
    ], $response->success ? 200 : $response->statusCode);
});
Route::get('/db-check', function () {
    try {
        DB::connection()->getPdo();
        return response()->json(['ok' => true, 'database' => 'connected'], 200);
    } catch (\Throwable $e) {
        return response()->json(['ok' => false, 'error' => 'Database connection failed'], 503);
    }
});
Route::match(['options'], '/login', fn () => response('', 204));
Route::get('/login', fn () => response()->json(['error' => 'Method not allowed', 'hint' => 'Use POST with login and password'], 405));
Route::post('/login', [AuthController::class, 'login']);
Route::match(['options'], '/register', fn () => response('', 204));
Route::post('/register', [AuthController::class, 'register']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', fn (\Illuminate\Http\Request $r) => response()->json([
        'status' => 'success',
        'data' => $r->user()->only(['id', 'name', 'email']),
    ]));
    Route::post('/chat', [ChatController::class, 'store']);
});
