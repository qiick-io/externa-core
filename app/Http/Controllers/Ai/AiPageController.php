<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Ai\AiConversationMessagePresenterService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Render the Inertia AI chat page with conversation and message props.
 */
class AiPageController extends Controller
{
    public function __construct(
        private readonly AiConversationMessagePresenterService $messagePresenter,
    ) {}

    /**
     * Render the chat page without a preselected conversation.
     */
    public function index(Request $request): Response
    {
        return $this->renderPage($request, null);
    }

    /**
     * Render the chat page for a specific owned conversation.
     */
    public function show(Request $request, string $conversation): Response
    {
        /** @var User $user */
        $user = $request->user();

        $owned = $user->conversations()
            ->where('id', $conversation)
            ->exists();

        abort_unless($owned, HttpResponse::HTTP_NOT_FOUND);

        return $this->renderPage($request, $conversation);
    }

    /**
     * Build Inertia props for the chat page, optionally loading a selected conversation.
     *
     * ponytail: keep the open chat visible even when it falls outside page 1 of the sidebar list.
     */
    private function renderPage(Request $request, ?string $selectedId): Response
    {
        /** @var User $user */
        $user = $request->user();

        $conversations = $user->conversations()
            // raw-sql: reviewed — fixed nulls-last pin ordering
            ->orderByRaw('pinned_at IS NULL')
            ->orderByDesc('pinned_at')
            ->latest('updated_at')
            ->paginate(25)
            ->through(fn (Conversation $conversation): array => $this->conversationSummary($conversation));

        $selected = null;
        $messages = [];

        if (is_string($selectedId) && $selectedId !== '') {
            $selected = $user->conversations()
                ->where('id', $selectedId)
                ->first(['id', 'title', 'pinned_at', 'created_at', 'updated_at']);

            abort_if($selected === null, HttpResponse::HTTP_NOT_FOUND);

            $rows = ConversationMessage::query()
                ->where('conversation_id', $selected->id)
                ->orderBy('created_at')
                ->orderBy('id')
                ->get(['id', 'role', 'content', 'attachments', 'steps', 'usage', 'meta', 'status', 'created_at']);

            $lastMessageId = $rows->last()?->id;

            $messages = $rows
                ->map(fn (ConversationMessage $message): array => $this->messagePresenter->present($message, $message->id === $lastMessageId))
                ->all();

            if ($conversations->getCollection()->where('id', $selected->id)->isEmpty()) {
                $conversations->setCollection(
                    $conversations->getCollection()->prepend($this->conversationSummary($selected))
                );
            }
        }

        return Inertia::render('ai/index', [
            'conversations' => $conversations,
            'selectedConversation' => $selected === null ? null : $this->conversationSummary($selected),
            'messages' => $messages,
        ]);
    }

    /**
     * Build a lightweight conversation summary for the chat sidebar.
     *
     * @return array{id: string, title: string|null, pinned_at: string|null, created_at: string|null, updated_at: string|null}
     */
    private function conversationSummary(Conversation $conversation): array
    {
        return [
            'id' => $conversation->id,
            'title' => $conversation->title,
            'pinned_at' => $this->toIso8601($conversation->pinned_at),
            'created_at' => $this->toIso8601($conversation->created_at),
            'updated_at' => $this->toIso8601($conversation->updated_at),
        ];
    }

    /**
     * Convert a datetime value to an ISO-8601 string when present.
     */
    private function toIso8601(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return Carbon::parse($value)->toIso8601String();
    }
}
