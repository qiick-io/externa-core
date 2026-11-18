<?php

declare(strict_types=1);

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\SearchAiConversationsRequest;
use App\Http\Requests\Ai\StoreAiConversationRequest;
use App\Models\User;
use App\Policies\AiConversationPolicy;
use App\Services\Ai\AiConversationMessagePresenterService;
use App\Services\Ai\AiConversationMutationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON API for listing, creating, and mutating AI chat conversations.
 *
 * Bulk delete lives in {@see AiConversationBulkController}, rewinding in {@see AiConversationTruncateController}.
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
    public function index(SearchAiConversationsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();
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
        $owned = $this->ownedConversation($conversation, 'view');

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
    public function store(StoreAiConversationRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();

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
        $owned = $this->ownedConversation($conversation, 'delete');

        $this->mutations->deleteConversation($owned);

        return response()->json(['ok' => true]);
    }

    /**
     * Toggle the pinned state of a conversation.
     */
    public function togglePin(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($conversation, 'update');

        $owned->pinned_at = $owned->pinned_at === null ? now() : null;
        $owned->save();

        return response()->json([
            'ok' => true,
            'conversation' => $owned->only(['id', 'title', 'pinned_at', 'created_at', 'updated_at']),
        ]);
    }

    /**
     * Resolve a conversation the authenticated user may act on ({@see AiConversationPolicy}), or
     * abort with an empty 404 so a foreign conversation looks like a missing one.
     */
    private function ownedConversation(string $conversationId, string $ability): Conversation
    {
        $conversation = Conversation::query()->find($conversationId);

        abort_unless(
            $conversation instanceof Conversation && Gate::allows($ability, $conversation),
            Response::HTTP_NOT_FOUND,
        );

        return $conversation;
    }
}
