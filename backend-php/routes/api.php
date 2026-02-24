<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/ping', fn () => response()->json(['ok' => true], 200));
Route::match(['options'], '/login', fn () => response('', 204));
Route::get('/login', fn () => response()->json(['error' => 'Method not allowed', 'hint' => 'Use POST with login and password'], 405));
Route::post('/login', [AuthController::class, 'login']);
