<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use OpenAI\Exceptions\ErrorException;
use OpenAI\Exceptions\RateLimitException;
use OpenAI\Exceptions\TransporterException;

class OpenAIService
{
    private const MODEL = 'gpt-4o-mini';

    private const TRANSCRIBE_MODEL = 'whisper-1';

    public function __construct(
        private readonly string $apiKey
    ) {
    }

    public function transcribe(UploadedFile|string $audio): OpenAIResponse
    {
        if ($this->apiKey === '') {
            return OpenAIResponse::error('OpenAI API key is not configured.');
        }

        $path = $audio instanceof UploadedFile ? $audio->getRealPath() : $audio;
        if (!is_string($path) || !is_readable($path)) {
            return OpenAIResponse::error('Invalid or unreadable audio file.', 400);
        }

        try {
            $client = \OpenAI::client($this->apiKey);
            $response = $client->audio()->transcribe([
                'model' => self::TRANSCRIBE_MODEL,
                'file' => fopen($path, 'r'),
            ]);
            $text = $response->text ?? '';
            if ($text === '') {
                return OpenAIResponse::error('Audio transcription returned no text.');
            }
            return OpenAIResponse::success(trim($text));
        } catch (ErrorException $e) {
            return OpenAIResponse::error('OpenAI API error: ' . $e->getMessage(), $e->getStatusCode());
        } catch (RateLimitException $e) {
            return OpenAIResponse::error('OpenAI rate limit exceeded. Please try again later.', 429);
        } catch (TransporterException $e) {
            return OpenAIResponse::error('Unable to reach OpenAI: ' . $e->getMessage(), 503);
        } catch (\Throwable $e) {
            return OpenAIResponse::error('An unexpected error occurred while transcribing.', 500);
        }
    }

    public function sendPrompt(string $prompt, array $previousMessages = []): OpenAIResponse
    {
        if ($this->apiKey === '') {
            return OpenAIResponse::error('OpenAI API key is not configured.');
        }

        $systemPrompt = (string) config('services.openai.system_prompt', '');

        try {
            $client = \OpenAI::client($this->apiKey);
            $messages = [];
            if ($systemPrompt !== '') {
                $messages[] = ['role' => 'system', 'content' => $systemPrompt];
            }
            foreach ($previousMessages as $m) {
                $role = $m['role'] ?? null;
                $content = $m['content'] ?? '';
                if (in_array($role, ['user', 'assistant'], true) && $content !== '') {
                    $messages[] = ['role' => $role, 'content' => $content];
                }
            }
            $messages[] = ['role' => 'user', 'content' => $prompt];

            $params = [
                'model' => self::MODEL,
                'messages' => $messages,
            ];
            $tools = $this->getAvailableTools();
            if (!empty($tools)) {
                $params['tools'] = $tools;
                $params['tool_choice'] = 'auto';
            }

            $response = $client->chat()->create($params);

            $message = $response->choices[0]->message ?? null;
            $content = $message->content ?? null;
            $toolCalls = null;
            if (isset($message->toolCalls) && is_array($message->toolCalls)) {
                $toolCalls = [];
                foreach ($message->toolCalls as $tc) {
                    $fn = $tc->function ?? null;
                    $toolCalls[] = [
                        'id' => $tc->id ?? null,
                        'name' => $fn->name ?? null,
                        'arguments' => $fn && isset($fn->arguments) ? (json_decode($fn->arguments, true) ?? []) : [],
                    ];
                }
            }

            if (($content === null || $content === '') && empty($toolCalls)) {
                return OpenAIResponse::error('Empty response from OpenAI.');
            }

            if ($content === null || $content === '') {
                $content = 'Done.';
            }

            return OpenAIResponse::success($content, 200, !empty($toolCalls) ? $toolCalls : null);
        } catch (ErrorException $e) {
            return OpenAIResponse::error(
                'OpenAI API error: ' . $e->getMessage(),
                $e->getStatusCode()
            );
        } catch (RateLimitException $e) {
            return OpenAIResponse::error('OpenAI rate limit exceeded. Please try again later.', 429);
        } catch (TransporterException $e) {
            return OpenAIResponse::error(
                'Unable to reach OpenAI: ' . $e->getMessage(),
                503
            );
        } catch (\Throwable $e) {
            return OpenAIResponse::error(
                'An unexpected error occurred while calling OpenAI.',
                500
            );
        }
    }

    public function getAvailableTools(): array
    {
        return config('openai-tools.tools', []);
    }

    public static function fromConfig(): self
    {
        return new self((string) config('services.openai.api_key', ''));
    }
}
