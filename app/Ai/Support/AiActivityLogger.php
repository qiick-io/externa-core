<?php

declare(strict_types=1);

namespace App\Ai\Support;

use App\Data\Api\ApiAccessData;
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
                'api_key_id' => self::currentApiKeyId(),
                ...self::currentOAuthClient(),
                'tool' => $tool,
                'input' => $redacted,
                'result' => self::truncate($result),
                'conversation_id' => $conversationId,
                'failed' => $failed,
            ], $extra))
            ->log($failed ? 'AI tool failed' : 'AI tool');
    }

    /**
     * The API key the current request authenticated with (MCP, public API), so a tool decision
     * names the key that authorised it; null for session users. Callers that know better (an
     * approved call names the key that asked for it) pass `api_key_id` in `$extra`.
     */
    private static function currentApiKeyId(): ?int
    {
        return app()->bound(ApiAccessData::class) ? app(ApiAccessData::class)->apiKey?->id : null;
    }

    /**
     * When the request authenticated with an OAuth access token (#802), the client it was issued
     * to, so the entry names the connector and not only the grant row behind `api_key_id`. Empty
     * for API keys and session users, whose entries keep their 1.5.0 shape.
     *
     * @return array{oauth_client_id?: string, oauth_client_name?: string}
     */
    private static function currentOAuthClient(): array
    {
        $apiKey = app()->bound(ApiAccessData::class) ? app(ApiAccessData::class)->apiKey : null;

        if ($apiKey === null || ! $apiKey->isOAuthGrant()) {
            return [];
        }

        return [
            'oauth_client_id' => (string) $apiKey->oauth_client_id,
            'oauth_client_name' => $apiKey->name,
        ];
    }

    /**
     * Full audit trail for registry/MCP/chat tool decisions (always logged when an actor exists).
     * The causer is the requester; a human-approved call also names its `approver_id`, flags
     * `is_self_approval` when the requester approved it, and is timed by the entry's `created_at`.
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
                'api_key_id' => self::currentApiKeyId(),
                ...self::currentOAuthClient(),
                'tool' => $tool,
                'input' => $redacted,
                'arguments' => $redacted,
                'decision' => $decision,
                'status' => $status,
                'surface' => $surface,
                'approver_id' => $approver?->id,
                // Self-approval is intended (#441): the requester is the human who owns the agent's
                // key, and an API key cannot approve. The flag keeps it visible in the audit trail.
                'is_self_approval' => $approver !== null && $actor !== null && $actor->is($approver),
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
