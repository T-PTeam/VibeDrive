<?php

namespace App\Services;

final readonly class OpenAIResponse
{
    private function __construct(
        public bool $success,
        public ?string $content,
        public ?string $error,
        public int $statusCode,
        public ?array $toolCalls = null
    ) {
    }

    public static function success(string $content, int $statusCode = 200, ?array $toolCalls = null): self
    {
        return new self(true, $content, null, $statusCode, $toolCalls);
    }

    public static function error(string $message, int $statusCode = 500): self
    {
        return new self(false, null, $message, $statusCode, null);
    }
}
