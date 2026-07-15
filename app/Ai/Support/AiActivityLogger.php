<?php

namespace App\Ai\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AiActivityLogger
{
    private const MAX_TEXT_LENGTH = 4000;

    public static function prompt(User $user, string $prompt, ?string $conversationId = null): void
    {
        activity()
            ->causedBy($user)
            ->useLog('ai')
            ->event('ai_prompt')
            ->withProperties([
                'conversation_id' => $conversationId,
                'prompt' => self::truncate($prompt),
            ])
            ->log('AI prompt');
    }

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
     */
    public static function tool(
        User $user,
        string $tool,
        array $input,
        string $result,
        ?string $conversationId = null,
        bool $failed = false,
    ): void {
        activity()
            ->causedBy($user)
            ->useLog('ai')
            ->event('ai_tool')
            ->withProperties([
                'tool' => $tool,
                'input' => $input,
                'result' => self::truncate($result),
                'conversation_id' => $conversationId,
                'failed' => $failed,
            ])
            ->log($failed ? 'AI tool failed' : 'AI tool');
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
