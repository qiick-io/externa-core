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

class ExportCollection implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    private const MAX_ROWS = 500;

    public function description(): Stringable|string
    {
        return 'Export up to 500 collection items as CSV or JSON content with a concise summary.';
    }

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

            $assembler = app(CollectionItemValuesAssembler::class);
            $rows = $collection->items()
                ->oldest('id')
                ->limit(self::MAX_ROWS)
                ->get()
                ->map(fn (CollectionItem $item): array => [
                    'id' => $item->id,
                    ...$assembler->assemble($item),
                ])
                ->all();

            $content = $format === 'csv'
                ? $this->toCsv($collection, $rows)
                : (json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '[]');

            return json_encode([
                'ok' => true,
                'collection_id' => $collection->id,
                'format' => $format,
                'rows_exported' => count($rows),
                'total_rows' => $collection->items_count,
                'truncated' => $collection->items_count > self::MAX_ROWS,
                'content' => $content,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection_id' => $schema->integer()->required(),
            'format' => $schema->string()->required()->description('csv|json'),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function toCsv(Collection $collection, array $rows): string
    {
        $stream = fopen('php://temp', 'r+');

        if ($stream === false) {
            throw new \RuntimeException('Unable to create CSV stream.');
        }

        $headers = ['id', ...$collection->fields->pluck('name')->all()];
        fputcsv($stream, $headers, ',', '"', '\\');

        foreach ($rows as $row) {
            fputcsv($stream, array_map(
                fn (string $header): string => is_scalar($row[$header] ?? null)
                    ? (string) $row[$header]
                    : (json_encode($row[$header] ?? null, JSON_UNESCAPED_UNICODE) ?: ''),
                $headers,
            ), ',', '"', '\\');
        }

        rewind($stream);
        $content = stream_get_contents($stream);
        fclose($stream);

        return $content === false ? '' : $content;
    }
}
