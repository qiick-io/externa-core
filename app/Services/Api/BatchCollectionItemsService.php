<?php

declare(strict_types=1);

namespace App\Services\Api;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionItem;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/**
 * Public CMS API batch create/update/delete for collection items.
 *
 * Each entry is atomic (own write Action / soft-delete). Failures are collected
 * per index; successes keep the same validation, revisions, activity log, and
 * webhook events as single-item writes. No separate batch webhook types.
 */
final class BatchCollectionItemsService
{
    public function __construct(
        private CreateCollectionItemAction $createCollectionItemAction,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private CollectionPermissionEnforcerService $permissionEnforcer,
    ) {}

    /**
     * @param  list<array{data?: mixed}>  $items
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, succeeded: int, failed: int}}
     */
    public function create(Request $request, Collection $collection, array $items): array
    {
        $results = [];
        $succeeded = 0;
        $failed = 0;

        foreach ($items as $index => $entry) {
            $data = $this->extractData($entry);

            try {
                $item = $this->createCollectionItemAction->execute(new CollectionItemWriteData(
                    collection: $collection,
                    data: $data,
                    creating: true,
                    request: $request,
                    shouldAssertWritableFields: true,
                    writableMode: 'create',
                ));
                $item->load(['collection' => fn ($query) => $query->with(['fields' => fn ($fields) => $fields->ordered()])]);

                $results[] = [
                    'index' => $index,
                    'ok' => true,
                    'item' => (new CollectionItemResource($item))->toArray($request),
                ];
                $succeeded++;
            } catch (Throwable $throwable) {
                $results[] = $this->failureEntry($index, $throwable);
                $failed++;
            }
        }

        return $this->envelope($results, $succeeded, $failed);
    }

    /**
     * @param  list<array{id?: mixed, data?: mixed}>  $items
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, succeeded: int, failed: int}}
     */
    public function update(Request $request, Collection $collection, array $items): array
    {
        $results = [];
        $succeeded = 0;
        $failed = 0;

        foreach ($items as $index => $entry) {
            try {
                $itemId = $this->requirePositiveInteger($entry['id'] ?? null, 'id');
                $data = $this->extractData($entry);

                $model = CollectionItem::query()
                    ->where('collection_id', $collection->id)
                    ->whereKey($itemId)
                    ->first();

                if ($model === null) {
                    throw new NotFoundHttpException(__('Item not found.'));
                }

                $this->permissionEnforcer->assertItemWritable($request, $collection, $model);

                $model = $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
                    collection: $collection,
                    data: $data,
                    item: $model,
                    creating: false,
                    version: $collection->versioning ? 'draft' : 'published',
                    request: $request,
                    shouldAssertWritableFields: true,
                    writableMode: 'update',
                ));
                $model->load(['collection' => fn ($query) => $query->with(['fields' => fn ($fields) => $fields->ordered()])]);

                $results[] = [
                    'index' => $index,
                    'ok' => true,
                    'item' => (new CollectionItemResource($model))->toArray($request),
                ];
                $succeeded++;
            } catch (Throwable $throwable) {
                $results[] = $this->failureEntry($index, $throwable, isset($entry['id']) ? (int) $entry['id'] : null);
                $failed++;
            }
        }

        return $this->envelope($results, $succeeded, $failed);
    }

    /**
     * Soft-delete items by id; missing ids become per-entry failures.
     *
     * @param  list<int>  $ids
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, succeeded: int, failed: int}}
     */
    public function delete(Request $request, Collection $collection, array $ids): array
    {
        $results = [];
        $succeeded = 0;
        $failed = 0;

        foreach ($ids as $index => $id) {
            try {
                $itemId = $this->requirePositiveInteger($id, 'id');

                $model = CollectionItem::query()
                    ->where('collection_id', $collection->id)
                    ->whereKey($itemId)
                    ->first();

                if ($model === null) {
                    throw new NotFoundHttpException(__('Item not found.'));
                }

                $this->permissionEnforcer->assertItemWritable($request, $collection, $model);
                $model->delete();

                $results[] = [
                    'index' => $index,
                    'ok' => true,
                    'id' => $itemId,
                ];
                $succeeded++;
            } catch (Throwable $throwable) {
                $results[] = $this->failureEntry($index, $throwable, is_numeric($id) ? (int) $id : null);
                $failed++;
            }
        }

        return $this->envelope($results, $succeeded, $failed);
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, succeeded: int, failed: int}}
     */
    private function envelope(array $results, int $succeeded, int $failed): array
    {
        return [
            'data' => $results,
            'meta' => [
                'total' => count($results),
                'succeeded' => $succeeded,
                'failed' => $failed,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    private function extractData(array $entry): array
    {
        $data = $entry['data'] ?? [];

        return is_array($data) ? $data : [];
    }

    private function requirePositiveInteger(mixed $value, string $attribute): int
    {
        if (is_int($value) && $value > 0) {
            return $value;
        }

        if (is_string($value) && ctype_digit($value) && (int) $value > 0) {
            return (int) $value;
        }

        throw ValidationException::withMessages([
            $attribute => [__('The :attribute must be a positive integer.', ['attribute' => $attribute])],
        ]);
    }

    /**
     * @return array{index: int, ok: false, error: array{message: string, status: int, errors?: array<string, list<string>>}, id?: int}
     */
    private function failureEntry(int $index, Throwable $throwable, ?int $id = null): array
    {
        $entry = [
            'index' => $index,
            'ok' => false,
            'error' => $this->normalizeError($throwable),
        ];

        if ($id !== null) {
            $entry['id'] = $id;
        }

        return $entry;
    }

    /**
     * @return array{message: string, status: int, errors?: array<string, list<string>>}
     */
    private function normalizeError(Throwable $throwable): array
    {
        if ($throwable instanceof ValidationException) {
            /** @var array<string, list<string>> $errors */
            $errors = $throwable->errors();

            return [
                'message' => $throwable->getMessage(),
                'status' => 422,
                'errors' => $errors,
            ];
        }

        if ($throwable instanceof HttpExceptionInterface) {
            $status = $throwable->getStatusCode();
            $message = $throwable->getMessage();

            return [
                'message' => $message !== '' ? $message : __('HTTP error'),
                'status' => $status,
            ];
        }

        report($throwable);

        return [
            'message' => __('Server Error'),
            'status' => 500,
        ];
    }
}
