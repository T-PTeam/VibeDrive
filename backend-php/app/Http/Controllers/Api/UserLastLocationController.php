<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PhpApiUserResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserLastLocationController extends Controller
{
    public function __construct(
        private PhpApiUserResolver $userResolver
    ) {}

    public function show(Request $request): JsonResponse
    {
        $userId = $request->query('user_id');
        if (! is_string($userId) || trim($userId) === '') {
            return response()->json([
                'status' => 'error',
                'message' => 'user_id is required',
                'data' => null,
            ], 400);
        }

        $user = $this->userResolver->resolve($userId);
        if ($user === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'User not found',
                'data' => null,
            ], 404);
        }

        $prefs = $user->preferences_json;
        if (! is_array($prefs)) {
            $prefs = [];
        }
        $loc = $prefs['last_location'] ?? null;
        if (! is_array($loc)
            || ! isset($loc['latitude'], $loc['longitude'])
            || ! is_numeric($loc['latitude'])
            || ! is_numeric($loc['longitude'])) {
            return response()->json([
                'status' => 'error',
                'message' => 'No last location',
                'data' => null,
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => [
                'latitude' => (float) $loc['latitude'],
                'longitude' => (float) $loc['longitude'],
                'recorded_at' => isset($loc['recorded_at']) && is_string($loc['recorded_at'])
                    ? $loc['recorded_at']
                    : null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|string',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
            'recorded_at' => 'nullable|string',
        ]);

        $user = $this->userResolver->resolve($validated['user_id']);
        if ($user === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'User not found',
                'data' => null,
            ], 404);
        }

        $prefs = $user->preferences_json;
        if (! is_array($prefs)) {
            $prefs = [];
        }

        $recordedAt = isset($validated['recorded_at']) && is_string($validated['recorded_at']) && $validated['recorded_at'] !== ''
            ? $validated['recorded_at']
            : now()->utc()->toIso8601String();

        $prefs['last_location'] = [
            'latitude' => (float) $validated['latitude'],
            'longitude' => (float) $validated['longitude'],
            'recorded_at' => $recordedAt,
        ];

        $user->preferences_json = $prefs;
        $user->save();

        return response()->json([
            'status' => 'success',
            'data' => $prefs['last_location'],
        ]);
    }
}
