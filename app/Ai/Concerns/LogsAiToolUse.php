<?php

namespace App\Ai\Concerns;

use App\Ai\Support\AiActivityLogger;
use App\Models\User;
use Laravel\Ai\Tools\Request;
use Stringable;
use Throwable;

/**
 * Concern that wraps AI tool handlers with activity logging.
 */
/**
 * Wraps AI tool execution with activity logging and safe error text responses.
 */
trait LogsAiToolUse
{
    /**
     * Execute a tool callback with activity logging and exception-to-text handling.
     */
    protected function withAiToolLogging(Request $request, callable $callback): Stringable|string
    {
        $user = $this->resolveToolUser();
        $conversationId = $this->resolveConversationId();
        $input = $this->redactSensitiveToolInput($request->all());
        $toolName = class_basename(static::class);

        try {
            $result = $callback();
            $resultText = (string) $result;

            if ($user !== null) {
                AiActivityLogger::tool(
                    $user,
                    $toolName,
                    $input,
                    $resultText,
                    $conversationId,
                    failed: str_starts_with($resultText, 'Error:'),
                );
            }

            return $result;
        } catch (Throwable $exception) {
            $message = 'Error: '.$exception->getMessage();

            if ($user !== null) {
                AiActivityLogger::tool(
                    $user,
                    $toolName,
                    $input,
                    $message,
                    $conversationId,
                    failed: true,
                );
            }

            // ponytail: return tool errors as text so chat streaming does not 500 on DB/validation failures
            return $message;
        }
    }

    protected function resolveToolUser(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }

    protected function resolveConversationId(): ?string
    {
        $conversationId = request()->input('conversation_id');

        return is_string($conversationId) && $conversationId !== '' ? $conversationId : null;
    }

    /**
     * Record an AI-driven mutation on a model subject when possible.
     */
    protected function logAiMutation(mixed $subject, string $action): void
    {
        $user = $this->resolveToolUser();

        if ($user === null || ! is_object($subject)) {
            return;
        }

        if (! method_exists($subject, 'getKey')) {
            return;
        }

        AiActivityLogger::mutation(
            $user,
            $subject,
            $action,
            $this->resolveConversationId(),
        );
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    protected function redactSensitiveToolInput(array $input): array
    {
        $sensitiveKeys = [
            'auth_bearer',
            'auth_header',
            'authorization',
            'bearer',
            'password',
            'token',
            'api_key',
            'apikey',
            'email',
            'phone',
            'telephone',
            'ssn',
            'social_security_number',
            'credit_card',
            'card_number',
            'cvv',
        ];

        foreach ($input as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            if (! in_array(strtolower($key), $sensitiveKeys, true)) {
                continue;
            }

            if (is_string($value) && $value !== '') {
                $input[$key] = '[redacted]';
            }
        }

        return $input;
    }
}
