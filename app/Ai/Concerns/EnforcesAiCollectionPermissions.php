<?php

namespace App\Ai\Concerns;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Apply CollectionPermissionEnforcer (field ACL / item_filter) inside AI tools.
 * Returns English Error strings instead of HTTP aborts.
 */
trait EnforcesAiCollectionPermissions
{
    protected function collectionPermissionEnforcer(): CollectionPermissionEnforcer
    {
        return app(CollectionPermissionEnforcer::class);
    }

    protected function aiPermissionRequest(): Request
    {
        $request = request();

        // AI tools often run outside an HTTP cycle; actingAs sets the guard but
        // the current Request may lack a user resolver until the next kernel hit.
        if ($request->user() === null) {
            $user = auth()->user();
            if ($user !== null) {
                $request->setUserResolver(static fn () => auth()->user());
            }
        }

        return $request;
    }

    /**
     * @param  Builder<CollectionItem>  $query
     */
    protected function applyAiItemFilter(Collection $collection, Builder $query): void
    {
        $this->collectionPermissionEnforcer()->applyItemFilterToQuery(
            $this->aiPermissionRequest(),
            $collection,
            $query,
        );
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function stripAiItemData(Collection $collection, array $data): array
    {
        return $this->collectionPermissionEnforcer()->stripData(
            $this->aiPermissionRequest(),
            $collection,
            $data,
        );
    }

    protected function guardAiItemReadable(Collection $collection, CollectionItem $item): ?string
    {
        try {
            $this->collectionPermissionEnforcer()->assertItemReadable(
                $this->aiPermissionRequest(),
                $collection,
                $item,
            );
        } catch (HttpExceptionInterface) {
            return 'Error: Item not found.';
        }

        return null;
    }

    protected function guardAiItemWritable(Collection $collection, CollectionItem $item): ?string
    {
        try {
            $this->collectionPermissionEnforcer()->assertItemWritable(
                $this->aiPermissionRequest(),
                $collection,
                $item,
            );
        } catch (HttpExceptionInterface $e) {
            $message = trim($e->getMessage());

            return 'Error: '.($message !== '' ? $message : 'This item is outside your permission filter.');
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function guardAiWritableFields(Collection $collection, array $data, string $operation): ?string
    {
        try {
            $this->collectionPermissionEnforcer()->assertWritableFields(
                $this->aiPermissionRequest(),
                $collection,
                $data,
                $operation,
            );
        } catch (ValidationException $e) {
            $first = collect($e->errors())->flatten()->first();

            return 'Error: '.(is_string($first) && $first !== '' ? $first : 'You cannot write those fields.');
        }

        return null;
    }
}
