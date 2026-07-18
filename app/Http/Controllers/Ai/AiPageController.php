<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Support\AiToolTurnSummary;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class AiPageController extends Controller
{
    public function index(Request $request): Response
    {
        return $this->renderPage($request, null);
    }

    public function show(Request $request, string $conversation): Response
    {
        /** @var User $user */
        $user = $request->user();

        $owned = Conversation::query()
            ->where('id', $conversation)
            ->where('user_id', $user->id)
            ->exists();

        abort_unless($owned, HttpResponse::HTTP_NOT_FOUND);

        return $this->renderPage($request, $conversation);
    }

    private function renderPage(Request $request, ?string $selectedId): Response
    {
        /** @var User $user */
        $user = $request->user();

        $conversations = $user->conversations()
            ->orderByRaw('pinned_at IS NULL')
            ->orderByDesc('pinned_at')
            ->latest('updated_at')
            ->paginate(25)
            ->through(fn (Conversation $conversation): array => $this->conversationSummary($conversation));

        $selected = null;
        $messages = [];

        if (is_string($selectedId) && $selectedId !== '') {
            $selected = Conversation::query()
                ->where('id', $selectedId)
                ->where('user_id', $user->id)
                ->first(['id', 'title', 'pinned_at', 'created_at', 'updated_at']);

            abort_if($selected === null, HttpResponse::HTTP_NOT_FOUND);

            $messages = ConversationMessage::query()
                ->where('conversation_id', $selected->id)
                ->orderBy('created_at')
                ->orderBy('id')
                ->get(['id', 'role', 'content', 'attachments', 'tool_calls', 'tool_results', 'created_at'])
                ->map(function (ConversationMessage $message): array {
                    $content = $this->normalizeMessageContent($message->content);
                    $toolCalls = $this->normalizeMessageArray($message->tool_calls);
                    $toolResults = $this->normalizeMessageArray($message->tool_results);
                    $attachments = $this->normalizeMessageAttachments($message->attachments);

                    if ($message->role === 'assistant' && trim($content) === '' && ($toolCalls !== [] || $toolResults !== [])) {
                        $content = AiToolTurnSummary::fromTools($toolCalls, $toolResults);
                    }

                    return [
                        'id' => $message->id,
                        'role' => $message->role,
                        'content' => $content,
                        'attachments' => $attachments,
                        'tool_calls' => $toolCalls,
                        'tool_results' => $toolResults,
                        'created_at' => $message->created_at?->toIso8601String(),
                    ];
                })
                ->all();

            // ponytail: keep the open chat visible even when it falls outside page 1
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

    private function toIso8601(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return Carbon::parse($value)->toIso8601String();
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

    /**
     * @return list<array{id?: string, name: string, mime?: string|null, size?: int|null}>
     */
    private function normalizeMessageAttachments(mixed $value): array
    {
        $items = $this->normalizeMessageArray($value);

        $attachments = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $name = $item['name'] ?? null;

            if (! is_string($name) || $name === '') {
                continue;
            }

            $attachments[] = [
                'id' => is_string($item['id'] ?? null) ? $item['id'] : null,
                'name' => $name,
                'mime' => is_string($item['mime'] ?? null) ? $item['mime'] : null,
                'size' => is_numeric($item['size'] ?? null) ? (int) $item['size'] : null,
            ];
        }

        return $attachments;
    }
}
