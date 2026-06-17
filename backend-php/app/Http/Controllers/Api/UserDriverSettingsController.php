<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PhpApiUserResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserDriverSettingsController extends Controller
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
        $settings = $prefs['driver_settings'] ?? null;
        if (! is_array($settings)
            || ! isset($settings['dest_city'], $settings['weight_kg'], $settings['volume_m3'])) {
            return response()->json([
                'status' => 'error',
                'message' => 'No saved driver settings',
                'data' => null,
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => $settings,
        ]);
    }

    public function ttsVoiceShow(Request $request): JsonResponse
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
        $id = $prefs['tts_voice_identifier'] ?? null;
        $id = is_string($id) && trim($id) !== '' ? trim($id) : null;

        return response()->json([
            'status' => 'success',
            'data' => [
                'tts_voice_identifier' => $id,
            ],
        ]);
    }

    public function ttsVoiceUpdate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|string',
            'tts_voice_identifier' => 'nullable|string|max:512',
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

        $raw = $validated['tts_voice_identifier'] ?? null;
        $id = is_string($raw) && trim($raw) !== '' ? trim($raw) : null;
        if ($id === null) {
            unset($prefs['tts_voice_identifier']);
        } else {
            $prefs['tts_voice_identifier'] = $id;
        }

        $user->preferences_json = $prefs;
        $user->save();

        return response()->json([
            'status' => 'success',
            'data' => [
                'tts_voice_identifier' => $prefs['tts_voice_identifier'] ?? null,
            ],
        ]);
    }
}
