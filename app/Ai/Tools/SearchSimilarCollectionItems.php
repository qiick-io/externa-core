<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\EnforcesAiCollectionPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Jobs\Ai\GenerateCollectionItemEmbeddingJob;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemEmbedding;
use App\Services\Ai\EmbeddingSimilarity;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool that finds collection items similar to a query via embeddings.
 */
class SearchSimilarCollectionItems implements Tool
{
    use ChecksAiPermissions;
    use EnforcesAiCollectionPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        if (config('ai.embeddings.enabled')) {
            return 'Semantic search across collection items using stored embeddings when available; falls back to case-insensitive text matching.';
        }

        return 'Semantic-lite search across collection item values using case-insensitive text matching. Enable AI_EMBEDDINGS_ENABLED for real embeddings.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
                return $error;
            }

            $collection = Collection::query()->find($request->integer('collection_id'));
            $query = trim((string) $request->string('query'));

            if ($collection === null || $query === '') {
                return 'Error: collection_id and query are required.';
            }

            $assembler = app(CollectionItemValuesAssembler::class);
            $limit = min(max($request->integer('limit', 10), 1), 50);

            if (config('ai.embeddings.enabled')) {
                $embedded = $this->searchWithEmbeddings($collection, $query, $assembler, $limit);
                if ($embedded !== null) {
                    return $embedded;
                }
            }

            return $this->searchTextFallback($collection, $query, $assembler, $limit);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->required(),
            'query' => $schema->string()->required(),
            'limit' => $schema->integer(),
        ];
    }

    private function searchWithEmbeddings(
        Collection $collection,
        string $query,
        CollectionItemValuesAssembler $assembler,
        int $limit,
    ): ?string {
        try {
            $queryVector = Embeddings::for([$query])->generate()->first();
        } catch (\Throwable) {
            return null;
        }

        if ($queryVector === []) {
            return null;
        }

        $stored = CollectionItemEmbedding::query()
            ->whereHas('item', fn ($q) => $q->where('collection_id', $collection->id))
            ->count();

        if ($stored === 0) {
            // Kick off generation for recent items; still fall back this request.
            $ids = $collection->items()->latest('id')->limit(50)->pluck('id');
            foreach ($ids as $id) {
                GenerateCollectionItemEmbeddingJob::dispatch((int) $id);
            }

            return null;
        }

        $matches = app(EmbeddingSimilarity::class)
            ->topMatches($queryVector, (int) $collection->id, $limit)
            ->map(function (array $row) use ($assembler, $collection): ?array {
                $item = CollectionItem::query()->find($row['collection_item_id']);
                if ($item === null) {
                    return null;
                }

                $builder = $collection->items()->getQuery()->whereKey($item->id);
                $this->applyAiItemFilter($collection, $builder);
                if (! $builder->exists()) {
                    return null;
                }

                return [
                    'id' => $item->id,
                    'collection_id' => $item->collection_id,
                    'score' => $row['score'],
                    'data' => $this->stripAiItemData($collection, $assembler->assemble($item)),
                ];
            })
            ->filter()
            ->values();

        return json_encode([
            'mode' => 'embeddings',
            'query' => $query,
            'items' => $matches,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function searchTextFallback(
        Collection $collection,
        string $query,
        CollectionItemValuesAssembler $assembler,
        int $limit,
    ): string {
        // ponytail: scan at most 500 recent items when embeddings off / empty
        $queryBuilder = $collection->items()->getQuery()->latest('id')->limit(500);
        $this->applyAiItemFilter($collection, $queryBuilder);

        $matches = $queryBuilder
            ->get()
            ->map(fn (CollectionItem $item): array => [
                'id' => $item->id,
                'collection_id' => $item->collection_id,
                'data' => $this->stripAiItemData($collection, $assembler->assemble($item)),
            ])
            ->filter(fn (array $item): bool => str_contains(
                mb_strtolower(json_encode($item['data'], JSON_UNESCAPED_UNICODE) ?: ''),
                mb_strtolower($query),
            ))
            ->take($limit)
            ->values();

        return json_encode([
            'mode' => 'semantic-lite',
            'query' => $query,
            'items' => $matches,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }
}
