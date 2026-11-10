<?php

namespace App\Services\Ai;

use App\Ai\Support\AiPendingApprovals;
use App\Ai\Support\AiToolTurnSummary;
use Carbon\CarbonInterface;
use Laravel\Ai\Models\ConversationMessage;

/**
 * Turns a stored laravel/ai conversation message into the payload the Assistant
 * page and the conversation API send to the browser.
 *
 * Besides the text, it keeps what the stream showed, so a reload loses nothing:
 * the steps in order (reasoning, text, tool calls with their arguments, results,
 * errors and denials, provider tools), the token usage, the model and the
 * citations.
 */
class AiConversationMessagePresenterService
{
    /**
     * @return array{
     *     id: string,
     *     role: string,
     *     content: string,
     *     attachments: list<array{id: string|null, name: string, mime: string|null, size: int|null}>,
     *     tool_calls: list<array<string, mixed>>,
     *     tool_results: list<array<string, mixed>>,
     *     pending_approvals: list<array<string, mixed>>,
     *     steps: list<array{reasoning: string, content: string, tools: list<array<string, mixed>>, provider_tools: list<array<string, mixed>>}>,
     *     usage: array<string, int>|null,
     *     model: string|null,
     *     provider: string|null,
     *     citations: list<array{url: string, title: string|null}>,
     *     error: string|null,
     *     status: string|null,
     *     created_at: string|null,
     * }
     */
    public function present(ConversationMessage $message, bool $isLastMessage): array
    {
        $content = $this->normalizeContent($message->content);
        $toolCalls = $message->tool_calls;
        $toolResults = $message->tool_results;
        $pendingApprovals = AiPendingApprovals::fromMessage($message);

        if ($message->role === 'assistant' && trim($content) === '') {
            if ($pendingApprovals !== []) {
                $content = $isLastMessage
                    ? AiToolTurnSummary::awaitingApproval()
                    : AiToolTurnSummary::approvalAbandoned($pendingApprovals);
            } elseif ($toolCalls !== [] || $toolResults !== []) {
                $content = AiToolTurnSummary::fromTools($toolCalls, $toolResults);
            }
        }

        // laravel/ai's model declares no @property for its casts; read them as attributes.
        $meta = $message->getAttribute('meta');
        $meta = is_array($meta) ? $meta : [];
        $steps = $message->getAttribute('steps');
        $createdAt = $message->getAttribute('created_at');

        return [
            'id' => $message->id,
            'role' => $message->role,
            'content' => $content,
            'attachments' => $this->normalizeAttachments($message->attachments),
            'tool_calls' => $toolCalls,
            'tool_results' => $toolResults,
            'pending_approvals' => $isLastMessage ? $pendingApprovals : [],
            'steps' => $this->presentSteps(is_array($steps) ? $steps : [], $isLastMessage),
            'usage' => $this->presentUsage($message->getAttribute('usage')),
            'model' => is_string($meta['model'] ?? null) ? $meta['model'] : null,
            'provider' => is_string($meta['provider'] ?? null) ? $meta['provider'] : null,
            'citations' => $this->presentCitations($meta['citations'] ?? []),
            'error' => is_string($meta['error'] ?? null) ? $meta['error'] : null,
            'status' => $message->status?->value,
            'created_at' => $createdAt instanceof CarbonInterface ? $createdAt->toIso8601String() : null,
        ];
    }

    /**
     * @param  array<int, mixed>  $steps
     * @return list<array{reasoning: string, content: string, tools: list<array<string, mixed>>, provider_tools: list<array<string, mixed>>}>
     */
    private function presentSteps(array $steps, bool $isLastMessage): array
    {
        $presented = [];

        foreach ($steps as $step) {
            if (! is_array($step)) {
                continue;
            }

            $presented[] = [
                'reasoning' => is_string($step['reasoning'] ?? null) ? $step['reasoning'] : '',
                'content' => is_string($step['content'] ?? null) ? $step['content'] : '',
                'tools' => array_values(array_map(
                    fn (array $toolCall): array => $this->presentToolCall($toolCall, $isLastMessage),
                    array_filter($step['tool_calls'] ?? [], 'is_array'),
                )),
                'provider_tools' => array_values(array_map(
                    fn (array $call): array => [
                        'id' => is_string($call['id'] ?? null) ? $call['id'] : '',
                        'type' => is_string($call['type'] ?? null) ? $call['type'] : 'provider_tool',
                        'data' => is_array($call['data'] ?? null) ? $call['data'] : [],
                    ],
                    array_filter($step['provider_tool_calls'] ?? [], 'is_array'),
                )),
            ];
        }

        return $presented;
    }

    /**
     * One tool call with the AI Elements tool state it ended in.
     *
     * @param  array<string, mixed>  $toolCall
     * @return array{id: string, name: string, arguments: mixed, state: string, result: mixed, error: string|null}
     */
    private function presentToolCall(array $toolCall, bool $isLastMessage): array
    {
        $hasResult = array_key_exists('result', $toolCall);
        $failed = ($toolCall['failed'] ?? false) === true;
        $denied = ($toolCall['denied'] ?? false) === true;
        $awaitingApproval = ! $hasResult && ! $denied && array_key_exists('approval_reason', $toolCall);

        $state = match (true) {
            $denied => 'output-denied',
            $failed => 'output-error',
            $hasResult => 'output-available',
            $awaitingApproval && $isLastMessage => 'approval-requested',
            $awaitingApproval => 'output-denied',
            default => 'input-available',
        };

        $result = $toolCall['result'] ?? null;

        return [
            'id' => is_string($toolCall['id'] ?? null) ? $toolCall['id'] : '',
            'name' => is_string($toolCall['name'] ?? null) ? $toolCall['name'] : 'tool',
            'arguments' => $toolCall['arguments'] ?? [],
            'state' => $state,
            'result' => $failed ? null : $result,
            'error' => $failed ? (is_string($result) ? $result : json_encode($result, JSON_UNESCAPED_UNICODE)) : null,
        ];
    }

    /**
     * @return array<string, int>|null
     */
    private function presentUsage(mixed $usage): ?array
    {
        if (! is_array($usage) || $usage === []) {
            return null;
        }

        $presented = [];

        foreach (['input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_read_input_tokens', 'cache_write_input_tokens'] as $key) {
            if (is_numeric($usage[$key] ?? null)) {
                $presented[$key] = (int) $usage[$key];
            }
        }

        return $presented === [] ? null : $presented;
    }

    /**
     * @return list<array{url: string, title: string|null}>
     */
    private function presentCitations(mixed $citations): array
    {
        if (! is_array($citations)) {
            return [];
        }

        $presented = [];

        foreach ($citations as $citation) {
            if (! is_array($citation) || ! is_string($citation['url'] ?? null) || $citation['url'] === '') {
                continue;
            }

            $presented[] = [
                'url' => $citation['url'],
                'title' => is_string($citation['title'] ?? null) ? $citation['title'] : null,
            ];
        }

        return $presented;
    }

    /**
     * Flatten stored content (plain string, JSON string or text parts) to text.
     */
    private function normalizeContent(mixed $content): string
    {
        if ($content === null) {
            return '';
        }

        if (is_string($content)) {
            $decoded = json_decode($content, true);

            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $this->normalizeContent($decoded);
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
     * Attachment metadata stored on a user turn.
     *
     * @return list<array{id: string|null, name: string, mime: string|null, size: int|null}>
     */
    private function normalizeAttachments(mixed $value): array
    {
        $items = is_array($value) ? $value : (is_string($value) && $value !== '' ? (json_decode($value, true) ?: []) : []);
        $attachments = [];

        foreach ($items as $item) {
            if (! is_array($item) || ! is_string($item['name'] ?? null) || $item['name'] === '') {
                continue;
            }

            $attachments[] = [
                'id' => is_string($item['id'] ?? null) ? $item['id'] : null,
                'name' => $item['name'],
                'mime' => is_string($item['mime'] ?? null) ? $item['mime'] : null,
                'size' => is_numeric($item['size'] ?? null) ? (int) $item['size'] : null,
            ];
        }

        return $attachments;
    }
}
