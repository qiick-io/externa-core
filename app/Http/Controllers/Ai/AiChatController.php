<?php

declare(strict_types=1);

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\AppAssistant;
use App\Ai\Support\AiActivityLogger;
use App\Ai\Support\AiPendingApprovals;
use App\Ai\Support\AiToolTurnSummary;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\SendAiChatMessageRequest;
use App\Models\AiChatAttachment;
use App\Models\User;
use App\Services\Ai\AiConversationContextService;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\Gate;
use Laravel\Ai\Approvals\Decisions;
use Laravel\Ai\Files\File;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Responses\StreamableAgentResponse;
use Laravel\Ai\Responses\StreamedAgentResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stream AI assistant responses over SSE for the in-app chat UI.
 */
class AiChatController extends Controller
{
    /**
     * Run the assistant stream for a validated prompt and emit SSE events to the client.
     *
     * The request enforces the daily prompt limit (429) and validates the payload (422) before the stream starts.
     * ponytail: sync SSE holds the PHP worker for the whole tool loop — raise ceiling above max_execution_time=30.
     * Tool-only turns backfill empty assistant rows with a short summary. User messages are rewritten
     * after streaming to restore clean text and display-only attachment metadata.
     * ponytail: in FPM, output buffers are ended so SSE reaches the browser; tests keep buffers.
     */
    public function __invoke(SendAiChatMessageRequest $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $isResume = $request->isResume();
        $validated = $request->validated();

        $conversationId = $validated['conversation_id'] ?? null;

        if (is_string($conversationId) && $conversationId !== '') {
            $conversation = Conversation::query()->find($conversationId);

            abort_unless(
                $conversation instanceof Conversation && Gate::allows('update', $conversation),
                Response::HTTP_NOT_FOUND,
            );
        }

        if (! app()->runningUnitTests()) {
            // ponytail: FPM defaults to 30s; tool loops + Xdebug burn CPU even while LM I/O waits.
            // Refresh to 0 (unlimited) — nginx/fastcgi_read_timeout (600s) is the outer ceiling.
            @ini_set('max_execution_time', '0');
            set_time_limit(0);
        }

        if ($isResume) {
            return $this->streamResponse(
                $this->resumeStream($user, (string) $conversationId, $validated['approvals']),
            );
        }

        $attachments = $this->resolveAttachments($user, $validated['attachment_ids'] ?? []);

        $context = app(AiConversationContextService::class)->resolveForSend(
            $user,
            $request,
            array_map('intval', $validated['context_item_ids'] ?? []),
            array_map('intval', $validated['context_file_ids'] ?? []),
            array_map('intval', $validated['context_prompt_ids'] ?? []),
        );

        $displayMessage = $validated['message'];
        $prompt = $this->promptWithAttachmentContext($displayMessage, $attachments)
            .$context['prompt_suffix'];
        $providerAttachments = $this->providerAttachments();

        AiActivityLogger::prompt($user, $displayMessage, $conversationId);

        $agent = new AppAssistant($user);

        if (is_string($conversationId) && $conversationId !== '') {
            $agent->continue($conversationId, as: $user);
        } else {
            $agent->forUser($user);
        }

        $displayAttachmentMeta = array_values([
            ...$attachments
                ->map(fn (AiChatAttachment $attachment): array => [
                    'type' => 'ai-chat-file',
                    'id' => $attachment->id,
                    'name' => $attachment->original_name,
                    'mime' => $attachment->mime_type,
                    'size' => $attachment->size,
                ])
                ->all(),
            ...$context['display'],
        ]);

        $stream = $agent
            ->stream($prompt, $providerAttachments)
            ->then(function (StreamedAgentResponse $response) use ($user, $displayMessage, $displayAttachmentMeta): void {
                $text = $this->finishTurn($response);

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

        return $this->streamResponse($stream);
    }

    /**
     * Resume a turn paused on destructive tool approvals with the user's decisions.
     *
     * ponytail: a resume adds no user message and no ai_prompt activity, so the daily limit and
     * RollbackLastAiTurn keep treating the approved tool calls as part of the original turn.
     *
     * @param  list<array{id: string, approved: bool}>  $approvals
     */
    private function resumeStream(User $user, string $conversationId, array $approvals): StreamableAgentResponse
    {
        $paused = ConversationMessage::query()
            ->where('conversation_id', $conversationId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first(['id', 'role', 'steps', 'status']);

        $pendingIds = $paused === null
            ? []
            : array_column(AiPendingApprovals::fromMessage($paused), 'id');

        $decisions = [];

        foreach ($approvals as $approval) {
            $decisions[(string) $approval['id']] = (bool) $approval['approved'];
        }

        abort_if(
            $pendingIds === [] || array_diff(array_keys($decisions), $pendingIds) !== [],
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'No pending tool approval matches this request.',
        );

        return (new AppAssistant($user))
            ->continue($conversationId, as: $user)
            ->stream(Decisions::from($decisions))
            ->then(function (StreamedAgentResponse $response) use ($user): void {
                AiActivityLogger::response(
                    $user,
                    $this->finishTurn($response),
                    $response->conversationId,
                    $response->meta->provider ?? null,
                    $response->meta->model ?? null,
                );
            });
    }

    /**
     * Backfill tool-only turns with a short summary and return the text to log for the turn.
     *
     * ponytail: paused turns are left untouched — a resume keeps the paused row's content when the
     * model adds no text, so a stored "waiting" notice would outlive the approval.
     */
    private function finishTurn(StreamedAgentResponse $response): string
    {
        $text = trim((string) ($response->text ?? ''));

        if ($response->hasPendingApprovals()) {
            return $text !== ''
                ? $text
                : AiToolTurnSummary::awaitingApproval();
        }

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

        return $text;
    }

    /**
     * Emit the agent stream to the client as SSE, closing with the conversation id and [DONE].
     */
    private function streamResponse(StreamableAgentResponse $stream): Response
    {
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
                    // Keep the worker alive across long multi-tool LM turns.
                    if (! app()->runningUnitTests()) {
                        set_time_limit(0);
                    }

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
