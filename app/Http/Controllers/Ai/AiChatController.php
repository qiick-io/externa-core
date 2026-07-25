<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\AppAssistant;
use App\Ai\Support\AiActivityLogger;
use App\Ai\Support\AiToolTurnSummary;
use App\Http\Controllers\Controller;
use App\Models\AiChatAttachment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection as SupportCollection;
use Laravel\Ai\Files\File;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Responses\StreamedAgentResponse;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stream AI assistant responses over SSE for the in-app chat UI.
 */
class AiChatController extends Controller
{
    /**
     * Validate the prompt, run the assistant stream, and emit SSE events to the client.
     *
     * ponytail: sync SSE holds the PHP worker for the whole tool loop — raise ceiling above max_execution_time=30.
     * Tool-only turns backfill empty assistant rows with a short summary. User messages are rewritten
     * after streaming to restore clean text and display-only attachment metadata.
     * ponytail: in FPM, output buffers are ended so SSE reaches the browser; tests keep buffers.
     */
    public function __invoke(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $dailyPromptLimit = (int) config('ai.daily_prompt_limit', 0);

        if (
            $dailyPromptLimit > 0
            && Activity::query()
                ->where('log_name', 'ai')
                ->where('event', 'ai_prompt')
                ->where('causer_type', $user->getMorphClass())
                ->where('causer_id', $user->id)
                ->where('created_at', '>=', now()->startOfDay())
                ->count() >= $dailyPromptLimit
        ) {
            return response()->json([
                'message' => 'Daily AI prompt limit reached.',
            ], Response::HTTP_TOO_MANY_REQUESTS);
        }

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:20000'],
            'conversation_id' => ['nullable', 'string', 'uuid'],
            'attachment_ids' => ['nullable', 'array', 'max:5'],
            'attachment_ids.*' => ['uuid'],
        ]);

        $conversationId = $validated['conversation_id'] ?? null;

        if (is_string($conversationId) && $conversationId !== '') {
            $owned = Conversation::query()
                ->where('id', $conversationId)
                ->where('user_id', $user->id)
                ->exists();

            abort_unless($owned, Response::HTTP_NOT_FOUND);
        }

        $attachments = $this->resolveAttachments($user, $validated['attachment_ids'] ?? []);

        if (! app()->runningUnitTests()) {
            @ini_set('max_execution_time', '600');
            set_time_limit(600);
        }

        $displayMessage = $validated['message'];
        $prompt = $this->promptWithAttachmentContext($displayMessage, $attachments);
        $providerAttachments = $this->providerAttachments();

        AiActivityLogger::prompt($user, $displayMessage, $conversationId);

        $agent = new AppAssistant($user);

        if (is_string($conversationId) && $conversationId !== '') {
            $agent->continue($conversationId, as: $user);
        } else {
            $agent->forUser($user);
        }

        $displayAttachmentMeta = $attachments
            ->map(fn (AiChatAttachment $attachment): array => [
                'type' => 'ai-chat-file',
                'id' => $attachment->id,
                'name' => $attachment->original_name,
                'mime' => $attachment->mime_type,
                'size' => $attachment->size,
            ])
            ->values()
            ->all();

        $stream = $agent
            ->stream($prompt, $providerAttachments)
            ->then(function (StreamedAgentResponse $response) use ($user, $displayMessage, $displayAttachmentMeta): void {
                $text = trim((string) ($response->text ?? ''));

                if ($text === '' && $response->toolResults->isNotEmpty()) {
                    $text = AiToolTurnSummary::fromResponse($response);

                    if ($response->conversationId !== null && $text !== '') {
                        ConversationMessage::query()
                            ->where('conversation_id', $response->conversationId)
                            ->where('role', 'assistant')
                            ->orderByDesc('created_at')
                            ->orderByDesc('id')
                            ->limit(1)
                            ->update(['content' => $text]);
                    }
                }

                if ($response->conversationId !== null) {
                    $userMessage = ConversationMessage::query()
                        ->where('conversation_id', $response->conversationId)
                        ->where('role', 'user')
                        ->orderByDesc('created_at')
                        ->orderByDesc('id')
                        ->first();

                    if ($userMessage !== null) {
                        $userMessage->content = $displayMessage;
                        $userMessage->attachments = $displayAttachmentMeta;
                        $userMessage->save();
                    }
                }

                AiActivityLogger::response(
                    $user,
                    $text,
                    $response->conversationId,
                    $response->meta->provider ?? null,
                    $response->meta->model ?? null,
                );
            });

        return response()->stream(function () use ($stream): void {
            if (! app()->runningUnitTests()) {
                while (ob_get_level() > 0) {
                    ob_end_flush();
                }
            }

            $emit = static function (array|string $payload): void {
                $data = is_string($payload) ? $payload : json_encode($payload, JSON_UNESCAPED_UNICODE);

                echo 'data: '.$data."\n\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }

                flush();
            };

            try {
                foreach ($stream as $event) {
                    $emit((string) $event);
                }

                if ($stream->conversationId !== null) {
                    $emit([
                        'type' => 'conversation',
                        'conversation_id' => $stream->conversationId,
                    ]);
                }

                $emit('[DONE]');
            } catch (\Throwable $exception) {
                report($exception);

                $emit([
                    'type' => 'error',
                    'message' => 'AI stream interrupted: '.$exception->getMessage()
                        .' (often a local model timeout/crash during a multi-tool loop).',
                ]);
                $emit('[DONE]');
            }
        }, headers: [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
            'Connection' => 'keep-alive',
        ]);
    }

    /**
     * Load and validate chat attachments owned by the current user.
     *
     * @param  list<string>|null  $attachmentIds
     * @return SupportCollection<int, AiChatAttachment>
     */
    private function resolveAttachments(User $user, ?array $attachmentIds): SupportCollection
    {
        if ($attachmentIds === null || $attachmentIds === []) {
            return collect();
        }

        $uniqueIds = array_values(array_unique($attachmentIds));

        $attachments = AiChatAttachment::query()
            ->where('user_id', $user->id)
            ->whereIn('id', $uniqueIds)
            ->get();

        abort_if($attachments->count() !== count($uniqueIds), Response::HTTP_UNPROCESSABLE_ENTITY, 'One or more attachments are invalid.');

        foreach ($attachments as $attachment) {
            abort_if($attachment->isExpired(), Response::HTTP_UNPROCESSABLE_ENTITY, 'One or more attachments have expired. Upload them again.');
        }

        return $attachments->values();
    }

    /**
     * Append structured attachment metadata to the model prompt.
     *
     * @param  SupportCollection<int, AiChatAttachment>  $attachments
     */
    private function promptWithAttachmentContext(string $message, SupportCollection $attachments): string
    {
        if ($attachments->isEmpty()) {
            return $message;
        }

        $lines = $attachments
            ->map(fn (AiChatAttachment $attachment): string => sprintf(
                '- attachment_id=%s name="%s" mime=%s size=%d',
                $attachment->id,
                $attachment->original_name,
                $attachment->mime_type,
                $attachment->size,
            ))
            ->implode("\n");

        return $message."\n\n[AI_ATTACHMENTS]\n{$lines}\n[/AI_ATTACHMENTS]\n"
            .'To import a CSV into a collection, use ImportCollectionCsv with attachment_id and collection_id.';
    }

    /**
     * Build provider multimodal attachments for supported file types.
     *
     * ponytail: local OpenAI-compatible servers often reject input_file parts; structured files
     * stay on the PHP import tool until Document/Image attachments are enabled here.
     *
     * @return list<File>
     */
    private function providerAttachments(): array
    {
        return [];
    }
}
