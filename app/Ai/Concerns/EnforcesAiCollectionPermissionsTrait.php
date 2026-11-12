<?php

namespace App\Ai\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Policies\CollectionItemPolicy;
use App\Policies\CollectionPolicy;
use App\Services\Api\CollectionPermissionEnforcerService;
use Illuminate\Contracts\Auth\Access\Gate as GateContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Apply collection ACL inside AI tools: abilities through {@see CollectionPolicy} and
 * {@see CollectionItemPolicy}, field ACL / item_filter scoping through CollectionPermissionEnforcerService.
 * Returns English Error strings instead of HTTP aborts.
 */
trait EnforcesAiCollectionPermissionsTrait
{
    protected function collectionPermissionEnforcer(): CollectionPermissionEnforcerService
    {
        return app(CollectionPermissionEnforcerService::class);
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
     * Gate for the actor of {@see aiPermissionRequest()}: the policies then judge that same
     * request (its `apiAccess` included) through PolicyRequestResolverService.
     */
    protected function aiCollectionGate(): GateContract
    {
        return Gate::forUser($this->aiPermissionRequest()->user());
    }

    /**
     * Collection-level gate (role grant, owner ceiling, API key `collection_slugs` / `read_only`).
     *
     * Read denials answer "not found" so out-of-scope collections stay invisible.
     */
    protected function guardAiCollectionAction(
        Collection $collection,
        CollectionPermissionActionEnum $action,
    ): ?string {
        if ($this->aiCollectionGate()->allows($action->itemsAbility(), $collection)) {
            return null;
        }

        return $action === CollectionPermissionActionEnum::Read
            ? 'Error: Collection not found.'
            : 'Error: This action is unauthorized for the collection.';
    }

    protected function isAiCollectionReadable(Collection $collection): bool
    {
        return $this->guardAiCollectionAction($collection, CollectionPermissionActionEnum::Read) === null;
    }

    /**
     * Loaded field definitions the actor may read (field ACL `read`), for schema payloads.
     *
     * @return EloquentCollection<int, CollectionField>
     */
    protected function readableAiFields(Collection $collection): EloquentCollection
    {
        $fieldNames = $collection->fields->pluck('name')->map(strval(...))->all();
        // ponytail: reuse the item stripper on a name-keyed map instead of a second field ACL resolver.
        $readableNames = array_map(
            strval(...),
            array_keys($this->stripAiItemData($collection, array_fill_keys($fieldNames, true))),
        );

        return $collection->fields
            ->filter(static fn (CollectionField $field): bool => in_array((string) $field->name, $readableNames, true))
            ->values();
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
        return $this->aiCollectionGate()->allows('view', [$item, $collection])
            ? null
            : 'Error: Item not found.';
    }

    protected function guardAiItemWritable(Collection $collection, CollectionItem $item): ?string
    {
        $response = $this->aiCollectionGate()->inspect('update', [$item, $collection]);
        if ($response->allowed()) {
            return null;
        }

        $message = trim((string) $response->message());

        return 'Error: '.($message !== '' ? $message : 'This item is outside your permission filter.');
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
