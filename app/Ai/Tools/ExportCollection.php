<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Services\Collections\CollectionItemExportService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool that exports collection items to a downloadable format.
 */
class ExportCollection implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Export up to '.CollectionItemExportService::MAX_ROWS.' collection items as CSV or JSON content with a concise summary.';
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

            $collection = Collection::query()
                ->with('fields')
                ->withCount('items')
                ->find($request->integer('collection_id'));

            if ($collection === null) {
                return 'Error: Collection not found.';
            }

            $format = strtolower(trim((string) $request->string('format', 'json')));

            if (! in_array($format, ['csv', 'json'], true)) {
                return 'Error: format must be csv or json.';
            }

            $exporter = app(CollectionItemExportService::class);
            $payload = $exporter->collectRows($collection, maxRows: CollectionItemExportService::MAX_ROWS);

            $content = $format === 'csv'
                ? $exporter->toCsv($collection, $payload['rows'])
                : $exporter->toJson($payload['rows']);

            return json_encode([
                'ok' => true,
                'collection_id' => $collection->id,
                'format' => $format,
                'rows_exported' => count($payload['rows']),
                'total_rows' => $collection->items_count,
                'truncated' => $payload['truncated'],
                'content' => $content,
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
            'format' => $schema->string()->required()->description('csv|json'),
        ];
    }
}
