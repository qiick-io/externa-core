<?php

namespace App\Ai\Support;

use Illuminate\Support\Collection;
use Laravel\Ai\Responses\StreamedAgentResponse;

/**
 * Summarizes tool calls and outcomes for an AI conversation turn.
 */
/**
 * Builds fallback Italian summaries when the model finishes tools without final text.
 */
final class AiToolTurnSummary
{
    /**
     * Build a short Italian summary when the model finished tools with no final text.
     *
     * @param  Collection<int, mixed>|array<int, mixed>  $toolCalls
     * @param  Collection<int, mixed>|array<int, mixed>  $toolResults
     */
    public static function fromTools(Collection|array $toolCalls, Collection|array $toolResults = []): string
    {
        $toolCallItems = Collection::wrap($toolCalls)->values();
        $toolResultItems = Collection::wrap($toolResults)->values();

        if ($toolCallItems->isEmpty() && $toolResultItems->isEmpty()) {
            return '';
        }

        $names = $toolCallItems
            ->merge($toolResultItems)
            ->map(fn (mixed $item): string => self::toolName($item))
            ->filter(fn (string $name): bool => $name !== '')
            ->unique()
            ->values();

        $successCount = $toolResultItems->filter(fn (mixed $item): bool => self::resultLooksSuccessful($item))->count();
        $totalResults = $toolResultItems->count();
        $toolLabel = $names->isEmpty() ? 'tool' : $names->implode(', ');

        if ($totalResults > 0) {
            return "Operazione completata tramite {$toolLabel} ({$successCount}/{$totalResults} esiti ok).";
        }

        return "Operazione eseguita tramite {$toolLabel}. Se serve, chiedimi di verificare il risultato.";
    }

    public static function fromResponse(StreamedAgentResponse $response): string
    {
        return self::fromTools($response->toolCalls, $response->toolResults);
    }

    private static function toolName(mixed $item): string
    {
        if (is_object($item) && isset($item->name) && is_string($item->name)) {
            return $item->name;
        }

        if (is_array($item) && isset($item['name']) && is_string($item['name'])) {
            return $item['name'];
        }

        if (is_array($item) && isset($item['function']['name']) && is_string($item['function']['name'])) {
            return $item['function']['name'];
        }

        return '';
    }

    private static function resultLooksSuccessful(mixed $item): bool
    {
        $raw = null;

        if (is_object($item) && isset($item->result)) {
            $raw = $item->result;
        } elseif (is_array($item)) {
            $raw = $item['result'] ?? $item['content'] ?? null;
        }

        if (! is_string($raw) || $raw === '') {
            return false;
        }

        if (str_starts_with(ltrim($raw), 'Error:')) {
            return false;
        }

        $decoded = json_decode($raw, true);

        if (is_array($decoded) && array_key_exists('ok', $decoded)) {
            return (bool) $decoded['ok'];
        }

        return true;
    }
}
