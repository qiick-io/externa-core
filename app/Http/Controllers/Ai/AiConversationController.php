<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Support\AiToolTurnSummary;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Symfony\Component\HttpFoundation\Response;

class AiConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $perPage = min(max($request->integer('per_page', 25), 1), 100);

        $conversations = $user->conversations()
            ->orderByRaw('pinned_at IS NULL')
            ->orderByDesc('pinned_at')
            ->latest('updated_at')
            ->paginate($perPage);

        return response()->json($conversations);
    }

    public function show(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($request, $conversation);

        $messages = ConversationMessage::query()
            ->where('conversation_id', $owned->id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'role', 'content', 'tool_calls', 'tool_results', 'created_at']);

        return response()->json([
            'conversation' => $owned->only(['id', 'title', 'pinned_at', 'created_at', 'updated_at']),
            'messages' => $messages->map(function (ConversationMessage $message): array {
                $content = $this->normalizeMessageContent($message->content);
                $toolCalls = $this->normalizeMessageArray($message->tool_calls);
                $toolResults = $this->normalizeMessageArray($message->tool_results);

                if ($message->role === 'assistant' && trim($content) === '' && ($toolCalls !== [] || $toolResults !== [])) {
                    $content = AiToolTurnSummary::fromTools($toolCalls, $toolResults);
                }

                return [
                    'id' => $message->id,
                    'role' => $message->role,
                    'content' => $content,
                    'tool_calls' => $toolCalls,
                    'tool_results' => $toolResults,
                    'created_at' => $message->created_at,
                ];
            }),
        ]);
    }

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

        Conversation::query()->create([
            'id' => $conversationId,
            'user_id' => $user->id,
            'title' => $title,
        ]);

        $conversation = Conversation::query()->findOrFail($conversationId);

        return response()->json([
            'conversation' => $conversation->only(['id', 'title', 'pinned_at', 'created_at', 'updated_at']),
        ], Response::HTTP_CREATED);
    }

    public function destroy(Request $request, string $conversation): JsonResponse
    {
        $owned = $this->ownedConversation($request, $conversation);

        DB::transaction(function () use ($owned): void {
            ConversationMessage::query()
                ->where('conversation_id', $owned->id)
                ->delete();

            $owned->delete();
        });

        return response()->json(['ok' => true]);
    }

    public function bulkDestroy(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['required', 'string', 'uuid'],
        ]);

        $ids = array_values(array_unique($validated['ids']));

        $ownedIds = Conversation::query()
            ->where('user_id', $user->id)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->all();

        abort_if(count($ownedIds) !== count($ids), Response::HTTP_NOT_FOUND);

        $deleted = DB::transaction(function () use ($ownedIds): int {
            ConversationMessage::query()
                ->whereIn('conversation_id', $ownedIds)
                ->delete();

            return Conversation::query()
                ->whereIn('id', $ownedIds)
                ->delete();
        });

        return response()->json([
            'ok' => true,
            'deleted' => $deleted,
        ]);
    }

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

        $deleted = DB::transaction(function () use ($owned, $anchor): int {
            return ConversationMessage::query()
                ->where('conversation_id', $owned->id)
                ->where(function ($query) use ($anchor): void {
                    $query->where('created_at', '>', $anchor->created_at)
                        ->orWhere(function ($sameInstant) use ($anchor): void {
                            $sameInstant->where('created_at', $anchor->created_at)
                                ->where('id', '>=', $anchor->id);
                        });
                })
                ->delete();
        });

        $owned->touch();

        return response()->json([
            'ok' => true,
            'deleted' => $deleted,
        ]);
    }

    private function ownedConversation(Request $request, string $conversationId): Conversation
    {
        /** @var User $user */
        $user = $request->user();

        $conversation = Conversation::query()
            ->where('id', $conversationId)
            ->where('user_id', $user->id)
            ->first();

        abort_if($conversation === null, Response::HTTP_NOT_FOUND);

        return $conversation;
    }

    private function normalizeMessageContent(mixed $content): string
    {
        if ($content === null) {
            return '';
        }

        if (is_string($content)) {
            $decoded = json_decode($content, true);

            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $this->normalizeMessageContent($decoded);
            }

            return $content;
        }

        if (! is_array($content)) {
            return (string) $content;
        }

        $textParts = [];

        foreach ($content as $part) {
            if (is_string($part)) {
                $textParts[] = $part;

                continue;
            }

            if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                $textParts[] = $part['text'];
            }
        }

        if ($textParts !== []) {
            return implode('', $textParts);
        }

        return json_encode($content, JSON_UNESCAPED_UNICODE) ?: '';
    }

    /**
     * @return array<int|string, mixed>
     */
    private function normalizeMessageArray(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_string($value) && $value !== '') {
            return json_decode($value, true) ?: [];
        }

        return [];
    }
}
