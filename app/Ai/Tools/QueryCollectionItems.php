<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\EnforcesAiCollectionPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool that searches and filters collection items for the assistant.
 */
class QueryCollectionItems implements Tool
{
    use ChecksAiPermissions;
    use EnforcesAiCollectionPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Query collection items by field filters and return compact tabular JSON.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanShowCollections)) {
                return $error;
            }

            $collection = Collection::query()->with('fields')->find($request->integer('collection_id'));

            if ($collection === null) {
                return 'Error: Collection not found.';
            }

            $filters = $this->decodeFilters((string) $request->string('filter_json'));

            if (is_string($filters)) {
                return $filters;
            }

            $query = $collection->items()->getQuery();
            app(CollectionItemQueryService::class)->applyFilters($query, $collection, $filters);
            $this->applyAiItemFilter($collection, $query);
            $assembler = app(CollectionItemValuesAssembler::class);
            $limit = min(max($request->integer('limit', 25), 1), 100);
            $rows = $query->latest('id')->limit($limit)->get()->map(
                function (CollectionItem $item) use ($assembler, $collection): array {
                    $data = $this->stripAiItemData($collection, $assembler->assemble($item));

                    return ['id' => $item->id, ...$data];
                },
            );

            return json_encode([
                'collection_id' => $collection->id,
                'columns' => ['id', ...$collection->fields->pluck('name')->all()],
                'rows' => $rows,
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
            'filter_json' => $schema->string()->description('JSON object of field filters, e.g. {"status":"published"}'),
            'limit' => $schema->integer()->description('Maximum rows, default 25 and max 100'),
        ];
    }

    /**
     * @return array<string, string>|string
     */
    private function decodeFilters(string $raw): array|string
    {
        if (trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);

        if (! is_array($decoded) || array_is_list($decoded)) {
            return 'Error: filter_json must be a JSON object.';
        }

        return array_map(fn (mixed $value): string => is_scalar($value) ? (string) $value : '', $decoded);
    }
}
