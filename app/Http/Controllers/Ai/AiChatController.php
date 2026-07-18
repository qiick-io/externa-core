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

class AiChatController extends Controller
{
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
                'message' => 'Limite giornaliero di prompt AI raggiunto.',
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

        // ponytail: sync SSE holds the PHP worker for the whole tool loop — raise ceiling above max_execution_time=30
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

                // Tool-only turns often persist empty assistant rows; backfill a short summary.
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
                        // Restore clean user text + display-only attachment meta (unknown type → not rehydrated to provider).
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
            // ponytail: in FPM, end buffers so SSE reaches the browser; keep them in tests
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
                    'message' => 'Lo stream AI si è interrotto: '.$exception->getMessage()
                        .' (spesso timeout/crash del modello locale durante loop con molti tool).',
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

        abort_if($attachments->count() !== count($uniqueIds), Response::HTTP_UNPROCESSABLE_ENTITY, 'Uno o più allegati non sono validi.');

        foreach ($attachments as $attachment) {
            abort_if($attachment->isExpired(), Response::HTTP_UNPROCESSABLE_ENTITY, 'Uno o più allegati sono scaduti. Caricali di nuovo.');
        }

        return $attachments->values();
    }

    /**
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
            .'Per importare un CSV in una collezione usa il tool ImportCollectionCsv con attachment_id e collection_id.';
    }

    /**
     * Provider multimodal attachments (Laravel\Ai Document/Image).
     * CSV/TXT use ImportCollectionCsv — no multimodal model required.
     *
     * @return list<File>
     */
    private function providerAttachments(): array
    {
        // ponytail: local OpenAI-compatible servers often reject input_file parts.
        // Structured files stay on the PHP import tool; pass Document/Image here when the provider supports them.
        return [];
    }
}
