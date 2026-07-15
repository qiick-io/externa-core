<?php

namespace App\Ai\Concerns;

use App\Ai\Support\AiActivityLogger;
use App\Models\User;
use Laravel\Ai\Tools\Request;
use Stringable;
use Throwable;

trait LogsAiToolUse
{
    protected function withAiToolLogging(Request $request, callable $callback): Stringable|string
    {
        $user = $this->resolveToolUser();
        $conversationId = $this->resolveConversationId();
        $input = $request->all();
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
            if ($user !== null) {
                AiActivityLogger::tool(
                    $user,
                    $toolName,
                    $input,
                    $exception->getMessage(),
                    $conversationId,
                    failed: true,
                );
            }

            throw $exception;
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
}
