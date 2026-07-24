<?php

namespace App\Services\Api;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Support\Api\ApiAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Apply field ACL + item_filter rules for API (role) and admin (user roles).
 */
class CollectionPermissionEnforcer
{
    public function __construct(
        private CollectionPermissionGuard $guard,
        private CollectionPermissionRules $rulesService,
        private CollectionItemValuesAssembler $assembler,
        private CollectionItemQueryService $itemQueryService,
    ) {}

    /**
     * @return array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}|null
     */
    public function resolveRules(Request $request, Collection $collection): ?array
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            return $this->guard->rulesFor($access->roleId(), (int) $collection->id);
        }

        $user = $request->user();
        if ($user instanceof User) {
            return $this->guard->rulesForUser($user, (int) $collection->id);
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function stripData(Request $request, Collection $collection, array $data): array
    {
        $rules = $this->resolveRules($request, $collection);
        if ($rules === null) {
            return $data;
        }

        return $this->rulesService->stripUnreadableFields($rules, $data);
    }

    public function assertItemReadable(Request $request, Collection $collection, CollectionItem $item): void
    {
        $rules = $this->resolveRules($request, $collection);
        if ($rules === null) {
            return;
        }

        $data = $this->assembler->assemble($item);
        if (! $this->rulesService->itemMatchesMerged($rules, $data)) {
            abort(404);
        }
    }

    public function assertItemWritable(Request $request, Collection $collection, CollectionItem $item): void
    {
        $rules = $this->resolveRules($request, $collection);
        if ($rules === null) {
            return;
        }

        $data = $this->assembler->assemble($item);
        if (! $this->rulesService->itemMatchesMerged($rules, $data)) {
            abort(403, 'This item is outside your permission filter.');
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function assertWritableFields(Request $request, Collection $collection, array $data, string $operation): void
    {
        $rules = $this->resolveRules($request, $collection);
        if ($rules === null) {
            return;
        }

        $denied = $this->rulesService->deniedWriteFields($rules, $data, $operation);
        if ($denied === []) {
            return;
        }

        throw ValidationException::withMessages([
            'data' => ['You cannot write fields: '.implode(', ', $denied)],
        ]);
    }

    /**
     * Apply item_filter as SQL constraints before paginate/count.
     *
     * @param  Builder<CollectionItem>  $query
     */
    public function applyItemFilterToQuery(Request $request, Collection $collection, Builder $query): void
    {
        $rules = $this->resolveRules($request, $collection);
        if ($rules === null || ($rules['item_filter'] ?? null) === null) {
            return;
        }

        /** @var array<string, mixed> $itemFilter */
        $itemFilter = $rules['item_filter'];
        $this->itemQueryService->applyPermissionItemFilter($query, $collection, $itemFilter);
    }
}
