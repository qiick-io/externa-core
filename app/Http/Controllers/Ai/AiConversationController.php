<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Ai\AiConversationMessagePresenterService;
use App\Services\Ai\AiConversationMutationService;
use App\Support\Validation\SearchQueryRules;
use App\Support\Validation\StringLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON API for listing, creating, and mutating AI chat conversations.
 */
class AiConversationController extends Controller
{
    public function __construct(
        private readonly AiConversationMutationService $mutations,
        private readonly AiConversationMessagePresenterService $messagePresenter,
    ) {}

    /**
     * Paginate the authenticated user's conversations with pinned items first.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'q' => SearchQueryRules::search(StringLimits::SEARCH_CHAT_HUB),
        ]);
        $search = trim((string) ($validated['q'] ?? ''));
        $perPage = min(max($request->integer('per_page', 25), 1), 100);

        $conversations = $user->conversations()
            ->when($search !== '', fn ($query) => $query->whereLike('title', '%'.$search.'%'))
            // raw-sql: reviewed — fixed nulls-last pin ordering
            ->orderByRaw('pinned_at IS NULL')
            ->orderByDesc('pinned_at')
            ->latest('updated_at')
            ->paginate($perPage);

        return response()->json($conversations);
    }

    /**
     * Return a conversation with normalized message content and tool metadata.
     */
    public function show(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($request, $conversation);

        $messages = ConversationMessage::query()
            ->where('conversation_id', $owned->id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'role', 'content', 'attachments', 'steps', 'usage', 'meta', 'status', 'created_at']);

        $lastMessageId = $messages->last()?->id;

        return response()->json([
            'conversation' => $owned->only(['id', 'title', 'pinned_at', 'created_at', 'updated_at']),
            'messages' => $messages->map(
                fn (ConversationMessage $message): array => $this->messagePresenter->present($message, $message->id === $lastMessageId),
            ),
        ]);
    }

    /**
     * Create a new conversation for the authenticated user.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:100'],
        ]);

        $conversationId = (string) Str::uuid7();
        $title = filled($validated['title'] ?? null)
            ? (string) $validated['title']
            : 'Nuova chat';

        $user->conversations()->create([
            'id' => $conversationId,
            'title' => $title,
        ]);

        $conversation = Conversation::query()->findOrFail($conversationId);

        return response()->json([
            'conversation' => $conversation->only(['id', 'title', 'pinned_at', 'created_at', 'updated_at']),
        ], Response::HTTP_CREATED);
    }

    /**
     * Delete a conversation and all of its messages.
     */
    public function destroy(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($request, $conversation);

        $this->mutations->deleteConversation($owned);

        return response()->json(['ok' => true]);
    }

    /**
     * Delete multiple owned conversations in one transaction.
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['required', 'string', 'uuid'],
        ]);

        $ids = array_values(array_unique($validated['ids']));

        $ownedIds = $user->conversations()
            ->whereIn('id', $ids)
            ->pluck('id')
            ->all();

        abort_if(count($ownedIds) !== count($ids), Response::HTTP_NOT_FOUND);

        $deleted = $this->mutations->deleteConversations($ownedIds);

        return response()->json([
            'ok' => true,
            'deleted' => $deleted,
        ]);
    }

    /**
     * Toggle the pinned state of a conversation.
     */
    public function togglePin(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($request, $conversation);

        $owned->pinned_at = $owned->pinned_at === null ? now() : null;
        $owned->save();

        return response()->json([
            'ok' => true,
            'conversation' => $owned->only(['id', 'title', 'pinned_at', 'created_at', 'updated_at']),
        ]);
    }

    /**
     * Delete a message and every message that follows it in the conversation.
     */
    public function truncate(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($request, $conversation);

        $validated = $request->validate([
            'from_message_id' => ['required', 'string', 'uuid'],
        ]);

        $anchor = ConversationMessage::query()
            ->where('conversation_id', $owned->id)
            ->where('id', $validated['from_message_id'])
            ->first();

        abort_if($anchor === null, Response::HTTP_NOT_FOUND);

        $deleted = $this->mutations->truncateFromMessage($owned, $anchor);

        $owned->touch();

        return response()->json([
            'ok' => true,
            'deleted' => $deleted,
        ]);
    }

    /**
     * Resolve a conversation owned by the authenticated user or abort with 404.
     */
    private function ownedConversation(Request $request, string $conversationId): Conversation
    {
        /** @var User $user */
        $user = $request->user();

        $conversation = $user->conversations()
            ->where('id', $conversationId)
            ->first();

        abort_if($conversation === null, Response::HTTP_NOT_FOUND);

        return $conversation;
    }
}
