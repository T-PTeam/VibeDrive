<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DriverMonitoringSession;
use App\Services\OpenAIService;
use App\Support\PhpApiUserResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class DriverRouteController extends Controller
{
    public function __construct(
        private PhpApiUserResolver $userResolver
    ) {}

    private function activeRouteKey(string $userId): string
    {
        return 'driver:active_route:'. $userId;
    }

    private function proposedLoadsKey(string $userId): string
    {
        return 'driver:proposed_loads:'. $userId;
    }

    public function getActiveRoute(Request $request): JsonResponse
    {
        $userId = $request->query('user_id');
        if (! is_string($userId) || $userId === '') {
            return response()->json([
                'status' => 'error',
                'message' => 'user_id is required',
                'data' => null,
            ], 400);
        }

        $raw = Redis::get($this->activeRouteKey($userId));
        if ($raw === null || $raw === '') {
            return response()->json([
                'status' => 'error',
                'message' => 'No active route',
                'data' => null,
            ], 404);
        }

        $decoded = json_decode((string) $raw, true);
        if (! is_array($decoded)) {
            return response()->json([
                'status' => 'error',
                'message' => 'No active route',
                'data' => null,
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => $decoded,
        ]);
    }

    public function startMonitoring(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|string',
            'dest_city' => 'required|string',
            'weight_kg' => 'required|numeric',
            'volume_m3' => 'required|numeric',
            'origin_city' => 'nullable|string',
        ]);

        $user = $this->userResolver->resolve($validated['user_id']);
        $origin = $validated['origin_city'] ?? null;

        $session = DriverMonitoringSession::create([
            'user_id' => $user?->id,
            'user_identifier' => $validated['user_id'],
            'dest_city' => $validated['dest_city'],
            'weight_kg' => $validated['weight_kg'],
            'volume_m3' => $validated['volume_m3'],
            'origin_city' => is_string($origin) && $origin !== '' ? $origin : null,
            'status' => 'pending',
        ]);

        return response()->json([
            'status' => 'success',
            'data' => [
                'id' => $session->id,
                'status' => $session->status,
                'dest_city' => $session->dest_city,
                'weight_kg' => (float) $session->weight_kg,
                'volume_m3' => (float) $session->volume_m3,
                'origin_city' => $session->origin_city ?? '',
                'created_at' => $session->created_at->utc()->toIso8601String(),
            ],
        ]);
    }

    public function getProposedLoads(Request $request): JsonResponse
    {
        $userId = $request->query('user_id');
        if (! is_string($userId) || $userId === '') {
            return response()->json([
                'status' => 'error',
                'message' => 'user_id is required',
                'data' => null,
            ], 400);
        }

        $raw = Redis::get($this->proposedLoadsKey($userId));
        $loads = [];
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            $loads = is_array($decoded) ? $decoded : [];
        }

        return response()->json([
            'status' => 'success',
            'data' => [
                'loads' => $loads,
            ],
        ]);
    }

    public function acceptLoad(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|string',
            'load_id' => 'required|string',
        ]);

        $raw = Redis::get($this->proposedLoadsKey($validated['user_id']));
        $loads = [];
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            $loads = is_array($decoded) ? $decoded : [];
        }

        $load = null;
        foreach ($loads as $item) {
            if (is_array($item) && isset($item['id']) && (string) $item['id'] === $validated['load_id']) {
                $load = $item;
                break;
            }
        }

        if ($load === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'Load not found',
                'data' => null,
            ], 404);
        }

        $now = now()->utc()->toIso8601String();
        $route = [
            'driver_id' => $validated['user_id'],
            'origin_city' => isset($load['origin_city']) && is_string($load['origin_city']) ? $load['origin_city'] : '',
            'dest_city' => isset($load['dest_city']) && is_string($load['dest_city']) ? $load['dest_city'] : '',
            'weight_kg' => isset($load['weight_kg']) ? (float) $load['weight_kg'] : 0.0,
            'volume_m3' => isset($load['volume_m3']) ? (float) $load['volume_m3'] : 0.0,
            'status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ];

        Redis::set($this->activeRouteKey($validated['user_id']), json_encode($route));

        return response()->json([
            'status' => 'success',
            'data' => $route,
        ]);
    }

    public function parseRouteSetup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'text' => 'required|string',
        ]);

        $service = OpenAIService::fromConfig();
        $prompt = 'Extract freight route setup from the user text. Reply with ONLY valid JSON, no markdown: {"dest_city":string|null,"weight_kg":number|null,"volume_m3":number|null,"ai_message":string|null}. User text: '.$validated['text'];
        $response = $service->sendPrompt($prompt);

        if (! $response->success || $response->content === null) {
            return response()->json([
                'status' => 'error',
                'message' => $response->error ?? 'Parse failed',
                'data' => null,
            ], $response->statusCode >= 400 ? $response->statusCode : 503);
        }

        $trimmed = trim($response->content);
        $trimmed = preg_replace('/^```(?:json)?\s*/i', '', $trimmed) ?? $trimmed;
        $trimmed = preg_replace('/\s*```$/', '', $trimmed) ?? $trimmed;

        $decoded = json_decode($trimmed, true);
        if (! is_array($decoded)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Invalid parse response',
                'data' => null,
            ], 502);
        }

        $data = [
            'dest_city' => $decoded['dest_city'] ?? null,
            'weight_kg' => isset($decoded['weight_kg']) ? (is_numeric($decoded['weight_kg']) ? (float) $decoded['weight_kg'] : null) : null,
            'volume_m3' => isset($decoded['volume_m3']) ? (is_numeric($decoded['volume_m3']) ? (float) $decoded['volume_m3'] : null) : null,
            'ai_message' => isset($decoded['ai_message']) && is_string($decoded['ai_message']) ? $decoded['ai_message'] : null,
        ];

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }
}
