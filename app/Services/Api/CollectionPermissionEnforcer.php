<?php

namespace App\Services\Api;

use App\Enums\CollectionPermissionAction;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
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
     * Field ACL map for admin item forms, or null when unrestricted
     * (super-admin / Spatie-only access / empty fields map).
     *
     * @return array<string, array{read: bool, create: bool, update: bool}>|null
     */
    public function fieldGrantsForForm(Request $request, Collection $collection): ?array
    {
        $rules = $this->resolveRules($request, $collection);
        if ($rules === null || ($rules['fields'] ?? []) === []) {
            return null;
        }

        return $rules['fields'];
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
        if (! $this->isItemReadable($request, $collection, $item)) {
            abort(404);
        }
    }

    /**
     * Soft collection Read check (API role grant or admin user Read / Spatie-only).
     */
    public function isCollectionReadable(Request $request, Collection $collection): bool
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            return $this->guard->allows($access->roleId(), (int) $collection->id, CollectionPermissionAction::Read);
        }

        $user = $request->user();
        if (! $user instanceof User) {
            return false;
        }

        return $this->userHasCollectionRead($user, $collection);
    }

    /**
     * Soft readability check (collection Read grant + item_filter). Does not abort.
     */
    public function isItemReadable(Request $request, Collection $collection, CollectionItem $item): bool
    {
        if (! $this->isCollectionReadable($request, $collection)) {
            return false;
        }

        $rules = $this->resolveRules($request, $collection);
        // No resolvable rules with an actor that passed collection Read:
        // Spatie-only / super-admin get unrestricted rules from rulesForUser.
        // Remaining null (no actor, or ACL user without grant) → deny.
        if ($rules === null) {
            return false;
        }

        $data = $this->assembler->assemble($item);

        return $this->rulesService->itemMatchesMerged($rules, $data);
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

    /**
     * Collection Read for an admin user: any role Read grant, or Spatie-only unrestricted.
     */
    private function userHasCollectionRead(User $user, Collection $collection): bool
    {
        $resolver = app(EffectivePermissionResolver::class);

        if ($resolver->isSuperAdmin($user)) {
            return true;
        }

        $roleIds = $resolver->effectiveRoleIds($user);
        foreach ($roleIds as $roleId) {
            if ($this->guard->allows($roleId, (int) $collection->id, CollectionPermissionAction::Read)) {
                return true;
            }
        }

        // Spatie-only (no collection_permissions on any role): can-show-collections is enough.
        if (! $this->userHasAnyCollectionGrant($user) && $resolver->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return true;
        }

        return false;
    }

    private function userHasAnyCollectionGrant(User $user): bool
    {
        $resolver = app(EffectivePermissionResolver::class);
        foreach ($resolver->effectiveRoleIds($user) as $roleId) {
            if ($this->guard->matrixForRole($roleId) !== []) {
                return true;
            }
        }

        return false;
    }
}
