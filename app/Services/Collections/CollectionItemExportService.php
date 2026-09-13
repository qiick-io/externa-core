<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Shared CSV/JSON export for collection items (admin UI + AI tool).
 */
class CollectionItemExportService
{
    public const MAX_ROWS = 5000;

    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionItemValuesAssembler $assembler,
        private CollectionPermissionEnforcer $permissionEnforcer,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{rows: list<array<string, mixed>>, truncated: bool, total_matched: int}
     */
    public function collectRows(
        Collection $collection,
        array $filters = [],
        ?string $sort = null,
        ?string $direction = null,
        ?Request $request = null,
        int $maxRows = self::MAX_ROWS,
    ): array {
        $collection->loadMissing(['fields' => fn ($q) => $q->ordered()]);

        $query = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        $this->itemQueryService->applyFilters($query, $collection, $filters);

        if ($request !== null) {
            $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);
        }

        $this->itemQueryService->applySort($query, $collection, $sort, $direction);

        $totalMatched = (clone $query)->count();
        $items = $query->limit($maxRows)->get();

        $rows = $items
            ->map(function (CollectionItem $item) use ($collection, $request): array {
                $data = $this->assembler->assemble($item);
                if ($request !== null) {
                    $data = $this->permissionEnforcer->stripData($request, $collection, $data);
                }

                return [
                    'id' => $item->id,
                    ...$data,
                ];
            })
            ->values()
            ->all();

        return [
            'rows' => $rows,
            'truncated' => $totalMatched > count($rows),
            'total_matched' => $totalMatched,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    public function toCsv(Collection $collection, array $rows): string
    {
        $collection->loadMissing(['fields' => fn ($q) => $q->ordered()]);

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

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    public function toJson(array $rows): string
    {
        return json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '[]';
    }

    /**
     * Stream a download response for the given format.
     *
     * @param  array<string, mixed>  $filters
     */
    public function download(
        Collection $collection,
        string $format,
        array $filters = [],
        ?string $sort = null,
        ?string $direction = null,
        ?Request $request = null,
    ): StreamedResponse {
        $format = strtolower($format);
        if (! in_array($format, ['csv', 'json'], true)) {
            abort(422, 'format must be csv or json.');
        }

        $payload = $this->collectRows($collection, $filters, $sort, $direction, $request);
        $filename = $collection->slug.'-items.'.($format === 'csv' ? 'csv' : 'json');
        $contentType = $format === 'csv' ? 'text/csv; charset=UTF-8' : 'application/json; charset=UTF-8';

        return response()->streamDownload(function () use ($collection, $format, $payload): void {
            echo $format === 'csv'
                ? $this->toCsv($collection, $payload['rows'])
                : $this->toJson($payload['rows']);
        }, $filename, [
            'Content-Type' => $contentType,
            'X-Export-Truncated' => $payload['truncated'] ? '1' : '0',
            'X-Export-Total-Matched' => (string) $payload['total_matched'],
            'X-Export-Rows' => (string) count($payload['rows']),
        ]);
    }

    /**
     * @param  Builder<CollectionItem>  $query
     */
    public function applyListingConstraints(
        Builder $query,
        Collection $collection,
        array $filters,
        ?Request $request = null,
    ): void {
        $this->itemQueryService->applyFilters($query, $collection, $filters);
        if ($request !== null) {
            $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);
        }
    }
}
