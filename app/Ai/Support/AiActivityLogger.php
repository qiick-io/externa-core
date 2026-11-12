<?php

declare(strict_types=1);

namespace App\Ai\Support;

use App\Models\User;
use App\Services\Ai\AiToolArgumentRedactorService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * Writes AI prompts, responses, tool calls, and mutations to the activity log.
 */
class AiActivityLogger
{
    private const MAX_TEXT_LENGTH = 4000;

    /**
     * Log an AI prompt to the activity log. These rows are what the daily prompt cap counts.
     *
     * @param  array<string, mixed>  $extra  e.g. `surface` and token `usage` for prompts without a conversation
     */
    public static function prompt(User $user, string $prompt, ?string $conversationId = null, array $extra = []): void
    {
        activity()
            ->causedBy($user)
            ->useLog('ai')
            ->event('ai_prompt')
            ->withProperties(array_merge([
                'conversation_id' => $conversationId,
                'prompt' => self::truncate($prompt),
            ], $extra))
            ->log('AI prompt');
    }

    /**
     * Log an AI model response to the activity log.
     */
    public static function response(
        User $user,
        string $response,
        ?string $conversationId = null,
        ?string $provider = null,
        ?string $model = null,
    ): void {
        activity()
            ->causedBy($user)
            ->useLog('ai')
            ->event('ai_response')
            ->withProperties([
                'conversation_id' => $conversationId,
                'response' => self::truncate($response),
                'provider' => $provider,
                'model' => $model,
            ])
            ->log('AI response');
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $extra
     */
    public static function tool(
        User $user,
        string $tool,
        array $input,
        string $result,
        ?string $conversationId = null,
        bool $failed = false,
        array $extra = [],
    ): void {
        $redacted = app(AiToolArgumentRedactorService::class)->redact($input);

        activity()
            ->causedBy($user)
            ->useLog('ai')
            ->event('ai_tool')
            ->withProperties(array_merge([
                'tool' => $tool,
                'input' => $redacted,
                'result' => self::truncate($result),
                'conversation_id' => $conversationId,
                'failed' => $failed,
            ], $extra))
            ->log($failed ? 'AI tool failed' : 'AI tool');
    }

    /**
     * Full audit trail for registry/MCP/chat tool decisions (always logged when an actor exists).
     *
     * @param  array<string, mixed>  $arguments
     * @param  array<string, mixed>  $extra
     */
    public static function toolDecision(
        ?User $actor,
        string $tool,
        array $arguments,
        string $decision,
        string $status,
        string $surface = 'chat',
        ?User $approver = null,
        ?string $result = null,
        ?string $pendingId = null,
        ?string $conversationId = null,
        array $extra = [],
    ): void {
        $redacted = app(AiToolArgumentRedactorService::class)->redact($arguments);

        $logger = activity()
            ->useLog('ai')
            ->event('ai_tool')
            ->withProperties(array_merge([
                'tool' => $tool,
                'input' => $redacted,
                'arguments' => $redacted,
                'decision' => $decision,
                'status' => $status,
                'surface' => $surface,
                'approver_id' => $approver?->id,
                'pending_id' => $pendingId,
                'result' => $result !== null ? self::truncate($result) : null,
                'conversation_id' => $conversationId,
                'failed' => in_array($status, ['denied', 'failed', 'rejected', 'expired'], true),
            ], $extra));

        if ($actor instanceof User) {
            $logger->causedBy($actor);
        }

        $logger->log(sprintf('AI tool %s (%s)', $decision, $status));
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    public static function mutation(
        User $user,
        Model $subject,
        string $action,
        ?string $conversationId = null,
        array $extra = [],
    ): void {
        activity()
            ->causedBy($user)
            ->performedOn($subject)
            ->useLog('ai')
            ->event('ai_mutation')
            ->withProperties(array_merge([
                'via' => 'ai',
                'conversation_id' => $conversationId,
                'action' => $action,
            ], $extra))
            ->log('AI mutation: '.$action);
    }

    private static function truncate(string $text): string
    {
        return Str::limit($text, self::MAX_TEXT_LENGTH, preserveWords: true);
    }
}
