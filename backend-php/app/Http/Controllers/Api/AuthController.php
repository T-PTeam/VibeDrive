<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'login' => 'required|string',
                'password' => 'required|string',
            ]);

            $login = $request->input('login');
            $password = $request->input('password');

            $email = $login === 'driver123' ? 'driver123@vibedrive.test' : $login;
            $user = User::where('email', $email)->first();

            if (!$user || !Hash::check($password, $user->password)) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'The provided credentials are incorrect.',
                    'errors' => ['login' => ['The provided credentials are incorrect.']],
                ], 422)->header('Content-Type', 'application/json');
            }

            $token = $user->createToken('api-login')->plainTextToken;

            return response()->json([
                'status' => 'success',
                'message' => 'Logged in successfully',
                'data' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'token' => $token,
                ],
            ], 200)->header('Content-Type', 'application/json');
        } catch (\Throwable $e) {
            Log::error('Login failed', ['exception' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            $message = config('app.debug') ? $e->getMessage() : 'Server error during login. Run: docker exec vibedrive-backend-php php artisan migrate --force && php artisan db:seed --force';
            return response()->json([
                'status' => 'error',
                'message' => $message,
            ], 500)->header('Content-Type', 'application/json');
        }
    }

    public function register(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
                'password' => ['required', 'string', 'min:8', 'confirmed'],
            ], [
                'email.unique' => 'This email is already registered.',
                'password.min' => 'Password must be at least 8 characters.',
                'password.confirmed' => 'Password confirmation does not match.',
            ]);

            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => $validated['password'],
            ]);

            $token = $user->createToken('api-register')->plainTextToken;

            return response()->json([
                'status' => 'success',
                'message' => 'Registered successfully',
                'data' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'token' => $token,
                ],
            ], 201)->header('Content-Type', 'application/json');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422)->header('Content-Type', 'application/json');
        } catch (\Throwable $e) {
            Log::error('Register failed', ['exception' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            $message = config('app.debug') ? $e->getMessage() : 'Server error during registration.';
            return response()->json([
                'status' => 'error',
                'message' => $message,
            ], 500)->header('Content-Type', 'application/json');
        }
    }
}
