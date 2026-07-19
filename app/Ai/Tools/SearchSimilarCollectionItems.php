<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool that finds collection items similar to a query via embeddings.
 */
class SearchSimilarCollectionItems implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * @return Stringable|string
     */
    public function description(): Stringable|string
    {
        return 'Semantic-lite search across collection item values using case-insensitive text matching; true embeddings are not configured.';
    }

    /**
     * @return Stringable|string
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
                return $error;
            }

            $collection = Collection::query()->find($request->integer('collection_id'));
            $query = trim((string) $request->string('query'));

            if ($collection === null || $query === '') {
                return 'Error: collection_id e query sono richiesti.';
            }

            $assembler = app(CollectionItemValuesAssembler::class);
            $limit = min(max($request->integer('limit', 10), 1), 50);

            // ponytail: scan at most 500 recent items; replace with embeddings when a provider is configured.
            $matches = $collection->items()
                ->latest('id')
                ->limit(500)
                ->get()
                ->map(fn (CollectionItem $item): array => [
                    'id' => $item->id,
                    'collection_id' => $item->collection_id,
                    'data' => $assembler->assemble($item),
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
            'limit' => $schema->integer()->description('Maximum 50 results'),
        ];
    }
}
