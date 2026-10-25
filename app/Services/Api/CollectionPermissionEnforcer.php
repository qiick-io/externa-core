<?php

namespace App\Services\Api;

use App\Enums\CollectionPermissionActionEnum;
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
     * Hard collection action gate for admin (and reusable for API actors).
     *
     * Super-admin: allow. Users with any collection_permissions grant: require a matching
     * grant on this collection + action. Spatie-only users (no collection_permissions
     * anywhere): keep today's behaviour (Spatie middleware already gated the route).
     */
    public function assertCollectionAction(
        Request $request,
        Collection $collection,
        CollectionPermissionActionEnum $action,
    ): void {
        if ($this->allowsCollectionAction($request, $collection, $action)) {
            return;
        }

        abort(403, 'This action is unauthorized for the collection.');
    }

    /**
     * Soft collection action check (API role grant ∩ key scopes, or admin user grant / Spatie-only).
     *
     * For API keys, scopes only narrow the role: collection_slugs allowlist and read_only.
     * Relation includes and item readability share this gate via {@see isItemReadable()}.
     */
    public function allowsCollectionAction(
        Request $request,
        Collection $collection,
        CollectionPermissionActionEnum $action,
    ): bool {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            if (! $this->guard->allows($access->roleId(), (int) $collection->id, $action)) {
                return false;
            }

            $apiKey = $access->apiKey;
            if ($apiKey === null) {
                return true;
            }

            return $apiKey->allowsCollectionSlug((string) $collection->slug)
                && $apiKey->allowsAction($action);
        }

        $user = $request->user();
        if (! $user instanceof User) {
            return false;
        }

        return $this->userAllowsCollectionAction($user, $collection, $action);
    }

    /**
     * Soft collection Read check (API role grant or admin user Read / Spatie-only).
     */
    public function isCollectionReadable(Request $request, Collection $collection): bool
    {
        return $this->allowsCollectionAction($request, $collection, CollectionPermissionActionEnum::Read);
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
            $this->abortIfAclScopedWithoutRules($request);

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
            $this->abortIfAclScopedWithoutRules($request);

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
        if ($rules === null) {
            $this->abortIfAclScopedWithoutRules($request);

            return;
        }

        if (($rules['item_filter'] ?? null) === null) {
            return;
        }

        /** @var array<string, mixed> $itemFilter */
        $itemFilter = $rules['item_filter'];
        $this->itemQueryService->applyPermissionItemFilter($query, $collection, $itemFilter);
    }

    /**
     * Collection action for an admin user: matching role grant, or Spatie-only unrestricted.
     */
    private function userAllowsCollectionAction(
        User $user,
        Collection $collection,
        CollectionPermissionActionEnum $action,
    ): bool {
        $resolver = app(EffectivePermissionResolver::class);

        if ($resolver->isSuperAdmin($user)) {
            return true;
        }

        foreach ($resolver->effectiveRoleIds($user) as $roleId) {
            if ($this->guard->allows($roleId, (int) $collection->id, $action)) {
                return true;
            }
        }

        // Spatie-only (no collection_permissions on any role): middleware already gated
        // can-show / can-edit — keep unrestricted collection access.
        if (! $this->userHasAnyCollectionGrant($user)) {
            return match ($action) {
                CollectionPermissionActionEnum::Read => $resolver->hasPermission(
                    $user,
                    PermissionEnum::CanShowCollections->value,
                ),
                default => $resolver->hasPermission(
                    $user,
                    PermissionEnum::CanEditCollections->value,
                ),
            };
        }

        return false;
    }

    /**
     * Null rules mean "no grant for this collection". Fail closed for ACL-scoped actors
     * (API role, or admin user who has at least one collection_permissions grant).
     */
    private function abortIfAclScopedWithoutRules(Request $request): void
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            abort(403, 'This action is unauthorized for the collection.');
        }

        $user = $request->user();
        if ($user instanceof User && $this->userHasAnyCollectionGrant($user)) {
            abort(403, 'This action is unauthorized for the collection.');
        }
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
