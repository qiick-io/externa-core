<?php

namespace App\Services\Ai;

use App\Models\CollectionItemEmbedding;
use Illuminate\Support\Collection;

/**
 * Cosine similarity over stored JSON embedding vectors.
 *
 * ponytail: O(n) PHP scan of at most N vectors — fine for beta; upgrade to pgvector / provider search later.
 */
class EmbeddingSimilarity
{
    /**
     * @param  list<float>  $query
     * @return Collection<int, array{collection_item_id: int, score: float}>
     */
    public function topMatches(array $query, int $collectionId, int $limit = 10, int $scan = 500): Collection
    {
        $rows = CollectionItemEmbedding::query()
            ->whereHas('item', fn ($q) => $q->where('collection_id', $collectionId))
            ->latest('id')
            ->limit($scan)
            ->get(['collection_item_id', 'vector']);

        return $rows
            ->map(function (CollectionItemEmbedding $row) use ($query): ?array {
                $vector = $row->vector;
                if (! is_array($vector) || $vector === []) {
                    return null;
                }

                return [
                    'collection_item_id' => (int) $row->collection_item_id,
                    'score' => $this->cosine($query, array_map('floatval', $vector)),
                ];
            })
            ->filter()
            ->sortByDesc('score')
            ->take($limit)
            ->values();
    }

    /**
     * @param  list<float>  $a
     * @param  list<float>  $b
     */
    public function cosine(array $a, array $b): float
    {
        $n = min(count($a), count($b));
        if ($n === 0) {
            return 0.0;
        }

        $dot = 0.0;
        $na = 0.0;
        $nb = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $dot += $a[$i] * $b[$i];
            $na += $a[$i] * $a[$i];
            $nb += $b[$i] * $b[$i];
        }

        if ($na <= 0.0 || $nb <= 0.0) {
            return 0.0;
        }

        return $dot / (sqrt($na) * sqrt($nb));
    }
}
