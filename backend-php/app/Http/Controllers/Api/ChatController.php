<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatSession;
use App\Models\Message;
use App\Services\OpenAIService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class ChatController extends Controller
{
    public function __construct(
        private readonly OpenAIService $openAI
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required_without:audio', 'nullable', 'string', 'max:65535'],
            'audio' => ['required_without:message', 'nullable', 'file', 'mimes:mp3,mp4,mpeg,mpga,m4a,wav,webm', 'max:26214400'],
            'session_id' => ['nullable', 'integer', 'exists:chat_sessions,id'],
        ]);

        $user = $request->user();
        $session = $this->resolveSession($request, $user->id, $validated['session_id'] ?? null);
        if ($session === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'Session not found or access denied.',
            ], 403);
        }

        $userContentResult = $this->resolveUserContent($request, $validated);
        if ($userContentResult['content'] === null) {
            return response()->json([
                'status' => 'error',
                'message' => $userContentResult['error'] ?? 'Provide either message or audio.',
            ], $userContentResult['status_code'] ?? 422);
        }
        $userContent = $userContentResult['content'];

        $previousMessages = Message::where('session_id', $session->id)
            ->orderBy('id', 'desc')
            ->limit(10)
            ->get()
            ->sortBy('id')
            ->map(fn (Message $m) => ['role' => $m->role, 'content' => $m->content])
            ->values()
            ->all();

        $userMessage = Message::create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => $userContent,
        ]);

        $response = $this->openAI->sendPrompt($userContent, $previousMessages);

        if (!$response->success) {
            return response()->json([
                'status' => 'error',
                'message' => $response->error,
                'data' => [
                    'session_id' => $session->id,
                    'user_message_id' => $userMessage->id,
                ],
            ], $response->statusCode);
        }

        $assistantMessage = Message::create([
            'session_id' => $session->id,
            'role' => 'assistant',
            'content' => $response->content,
        ]);

        $this->publishDriverUpdate($user->id, $response->content, 'chat_response');

        $data = [
            'session_id' => $session->id,
            'user_message' => ['id' => $userMessage->id, 'content' => $userMessage->content],
            'assistant_message' => ['id' => $assistantMessage->id, 'content' => $assistantMessage->content],
        ];
        if ($response->toolCalls !== null) {
            $data['tool_calls'] = $response->toolCalls;
        }
        return response()->json(['status' => 'success', 'data' => $data], 200);
    }

    private function resolveSession(Request $request, int $userId, ?int $sessionId): ?ChatSession
    {
        if ($sessionId !== null) {
            $session = ChatSession::where('id', $sessionId)->where('user_id', $userId)->first();
            return $session;
        }
        return ChatSession::create([
            'user_id' => $userId,
            'title' => 'Chat ' . now()->format('Y-m-d H:i'),
            'is_active' => true,
        ]);
    }

    private function resolveUserContent(Request $request, array $validated): array
    {
        if (!empty($validated['message'])) {
            return ['content' => $validated['message'], 'error' => null, 'status_code' => 200];
        }
        if ($request->hasFile('audio')) {
            $transcribe = $this->openAI->transcribe($request->file('audio'));
            if (!$transcribe->success) {
                return ['content' => null, 'error' => $transcribe->error, 'status_code' => $transcribe->statusCode];
            }
            return ['content' => $transcribe->content, 'error' => null, 'status_code' => 200];
        }
        return ['content' => null, 'error' => 'Provide either message or audio.', 'status_code' => 422];
    }

    private function publishDriverUpdate(int $targetUserId, string $message, string $action): void
    {
        $payload = [
            'userId' => (string) $targetUserId,
            'type' => 'chat_response',
            'data' => [
                'type' => 'ai_response',
                'targetUserId' => $targetUserId,
                'message' => $message,
                'action' => $action,
            ],
            'timestamp' => now()->toIso8601String(),
        ];
        Redis::publish('driver_updates', json_encode($payload));
    }
}
