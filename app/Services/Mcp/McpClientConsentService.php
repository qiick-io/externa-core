<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Enums\ApiKeyScopeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection as SupportCollection;
use Laravel\Passport\Bridge\Client as BridgeClient;
use Laravel\Passport\Bridge\Scope as BridgeScope;
use Laravel\Passport\Bridge\User as BridgeUser;
use Laravel\Passport\Client;
use Laravel\Passport\Scope;
use League\OAuth2\Server\Entities\ScopeEntityInterface;
use League\OAuth2\Server\RequestTypes\AuthorizationRequest;
use League\OAuth2\Server\RequestTypes\AuthorizationRequestInterface;
use League\Uri\UriString;
use Throwable;

/**
 * What the consent screen for a remote MCP client offers and accepts (#802).
 *
 * The consent screen narrows: a grant never carries the user's full access. What it can hold is
 * exactly what an API key the same user issued could hold, decided by the same rules:
 *
 * - scopes: the API-key vocabulary the user may give ({@see EffectivePermissionResolverService::canGrantScope()}),
 *   offered whenever the wire request carries `mcp:use` (or nothing after filtering), and at
 *   least one `mcp` scope, without which the grant could not reach the endpoint;
 * - a role the user holds (any role but super-admin and public, for a super-admin), never
 *   super-admin: like a key, the grant acts with that role and is capped by its owner;
 * - optionally, the collections it may touch (`collection_slugs`), among those the user can read.
 *
 * Consent screens in this fleet are written with suspicion: the client name is the client's
 * own claim, so the page always shows the host the grant returns to as well.
 */
final class McpClientConsentService
{
    public function __construct(
        private readonly EffectivePermissionResolverService $permissionResolver,
        private readonly CollectionPermissionEnforcerService $collectionPermissionEnforcer,
    ) {}

    /**
     * Inertia props of the consent page, from Passport's authorization view parameters.
     *
     * @param  list<Scope>  $requestedScopes
     * @return array<string, mixed>
     */
    public function consentPageProps(Request $request, User $user, Client $client, array $requestedScopes, string $authToken): array
    {
        $offeredScopes = $this->offeredScopes(array_map(static fn (Scope $scope): string => $scope->id, $requestedScopes));
        $grantableRoles = $this->grantableRoles($user);

        return [
            'authToken' => $authToken,
            'client' => [
                'id' => (string) $client->getKey(),
                'name' => $client->name,
                'redirectHost' => $this->redirectHost($request, $client),
            ],
            'scopes' => array_map(fn (ApiKeyScopeEnum $scope): array => [
                'value' => $scope->value,
                'isGrantable' => $this->permissionResolver->canGrantScope($user, $scope),
            ], $offeredScopes),
            'roles' => $grantableRoles->map(static fn (Role $role): array => [
                'id' => (int) $role->id,
                'name' => $role->name,
            ])->values()->all(),
            'collections' => $this->readableCollections($request)
                ->map(static fn (Collection $collection): array => [
                    'slug' => (string) $collection->slug,
                    'name' => (string) $collection->name,
                ])
                ->values()
                ->all(),
            'canGrant' => $this->canGrant($user, $offeredScopes),
        ];
    }

    /**
     * The API-key scopes the consent screen offers. The wire request only carries `mcp:use`;
     * narrowing lives on the grant row, so every grantable API-key scope is offered (the user
     * clears what the client should not get). `$requestedScopeValues` is kept for the call sites
     * that still pass Passport's requested scopes.
     *
     * @param  list<string>  $requestedScopeValues
     * @return list<ApiKeyScopeEnum>
     */
    public function offeredScopes(array $requestedScopeValues): array
    {
        unset($requestedScopeValues);

        return ApiKeyScopeEnum::cases();
    }

    /**
     * The roles a grant from this user may act with. Roles held directly or through a group;
     * a super-admin, who may issue a key with any role, may pick any role but super-admin.
     *
     * @return SupportCollection<int, Role>
     */
    public function grantableRoles(User $user): SupportCollection
    {
        $roleQuery = Role::query()
            ->whereNotIn('name', [RoleEnum::SuperAdmin->value, RoleEnum::Public->value])
            ->orderBy('name');

        if (! $this->permissionResolver->isSuperAdmin($user)) {
            $roleQuery->whereIn('id', $this->permissionResolver->effectiveRoleIds($user));
        }

        return $roleQuery->get(['id', 'name']);
    }

    /**
     * Collections the user can read right now; a grant can only be narrowed to these.
     *
     * @return SupportCollection<int, Collection>
     */
    public function readableCollections(Request $request): SupportCollection
    {
        return Collection::query()
            ->active()
            ->orderBy('name')
            ->get()
            ->filter(fn (Collection $collection): bool => $this->collectionPermissionEnforcer->isCollectionReadable($request, $collection))
            ->values();
    }

    /**
     * Whether the user can approve anything at all: they may use AI, hold a grantable role, and
     * may give at least one offered `mcp` scope.
     *
     * @param  list<ApiKeyScopeEnum>  $offeredScopes
     */
    public function canGrant(User $user, array $offeredScopes): bool
    {
        if (! $this->permissionResolver->hasPermission($user, PermissionEnum::CanUseAi->value)) {
            return false;
        }

        if ($this->grantableRoles($user)->isEmpty()) {
            return false;
        }

        foreach ($offeredScopes as $offeredScope) {
            if ($offeredScope->resource() === 'mcp' && $this->permissionResolver->canGrantScope($user, $offeredScope)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The authorization request the consent page was rendered for, without taking it out of the
     * session (Passport's approve step pulls it once the form validated).
     */
    public function pendingAuthorizationRequest(Request $request): ?AuthorizationRequestInterface
    {
        $serializedAuthorizationRequest = $request->session()->get('authRequest');

        if (! is_string($serializedAuthorizationRequest)) {
            return null;
        }

        $authorizationRequest = unserialize($serializedAuthorizationRequest, ['allowed_classes' => [
            AuthorizationRequest::class,
            BridgeClient::class,
            BridgeScope::class,
            BridgeUser::class,
        ]]);

        return $authorizationRequest instanceof AuthorizationRequestInterface ? $authorizationRequest : null;
    }

    /**
     * The scope values a pending authorization request asked for.
     *
     * @return list<string>
     */
    public function requestedScopeValues(AuthorizationRequestInterface $authorizationRequest): array
    {
        return array_values(array_map(
            static fn (ScopeEntityInterface $scope): string => $scope->getIdentifier(),
            $authorizationRequest->getScopes(),
        ));
    }

    /**
     * The host the grant returns to: the request's `redirect_uri`, or the client's only one.
     */
    private function redirectHost(Request $request, Client $client): string
    {
        $redirectUri = $request->query('redirect_uri');
        $redirectUri = is_string($redirectUri) && $redirectUri !== '' ? $redirectUri : ($client->redirect_uris[0] ?? '');
        $redirectUriService = app(McpOAuthRedirectUriService::class);
        $redirectHost = $redirectUriService->rawHostOf((string) $redirectUri);

        if (is_string($redirectHost) && $redirectHost !== '') {
            return $redirectHost;
        }

        try {
            $parts = UriString::parse((string) $redirectUri);
        } catch (Throwable) {
            return '';
        }

        return is_string($parts['scheme'] ?? null) ? (string) $parts['scheme'] : '';
    }
}
