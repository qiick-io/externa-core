<?php

declare(strict_types=1);

namespace App\Http\Requests\Mcp;

use App\Enums\ApiKeyScopeEnum;
use App\Models\Collection;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Mcp\McpClientConsentService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validate a user's approval of a remote MCP client on the consent screen (#802).
 *
 * The approval is checked against the pending authorization request in the session, never
 * against what the form claims: only scopes the client asked for and the user may give, a role
 * the user may grant, and collections the user can read. The act of approving is authorized
 * here, not only the page that shows the form (the shape of signaculum-core#110).
 */
class ApproveMcpClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $consentService = app(McpClientConsentService::class);
        $authorizationRequest = $consentService->pendingAuthorizationRequest($this);

        abort_unless(
            $user instanceof User
                && $authorizationRequest !== null
                && $authorizationRequest->getUser()?->getIdentifier() === (string) $user->getAuthIdentifier()
                && $consentService->canGrant($user, $this->offeredScopes()),
            403,
        );

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var User $user checked in authorize() */
        $user = $this->user();
        $consentService = app(McpClientConsentService::class);

        return [
            'auth_token' => ['required', 'string'],
            'role_id' => [
                'required',
                'integer',
                Rule::in($consentService->grantableRoles($user)->map(static fn (Role $role): int => (int) $role->id)->all()),
            ],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => [
                'string',
                'distinct',
                Rule::in(array_map(static fn (ApiKeyScopeEnum $scope): string => $scope->value, $this->offeredScopes())),
                $this->userMayGrantScope(...),
            ],
            'collection_slugs' => ['nullable', 'array'],
            'collection_slugs.*' => [
                'string',
                'distinct',
                Rule::in($consentService->readableCollections($this)->map(static fn (Collection $collection): string => (string) $collection->slug)->all()),
            ],
        ];
    }

    /**
     * A grant without an `mcp` scope could never reach the MCP endpoint.
     *
     * @return list<Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $approvedScopes = $this->input('scopes');

                if (! is_array($approvedScopes)) {
                    return;
                }

                foreach ($approvedScopes as $approvedScope) {
                    if (is_string($approvedScope) && ApiKeyScopeEnum::tryFrom($approvedScope)?->resource() === 'mcp') {
                        return;
                    }
                }

                $validator->errors()->add('scopes', __('Select mcp:read or mcp:write: without one the client cannot use MCP.'));
            },
        ];
    }

    /**
     * The approved scopes, one per resource, the highest approved (`write` implies `read`).
     *
     * @return list<ApiKeyScopeEnum>
     */
    public function approvedScopes(): array
    {
        return ApiKeyScopeEnum::highestPerResource($this->enums('scopes', ApiKeyScopeEnum::class));
    }

    /**
     * The collections the grant is narrowed to; null for every collection the role may reach.
     *
     * @return list<string>|null
     */
    public function approvedCollectionSlugs(): ?array
    {
        $collectionSlugs = array_values(array_filter($this->array('collection_slugs'), is_string(...)));

        return $collectionSlugs === [] ? null : $collectionSlugs;
    }

    /**
     * The scopes the pending authorization request offers.
     *
     * @return list<ApiKeyScopeEnum>
     */
    private function offeredScopes(): array
    {
        $consentService = app(McpClientConsentService::class);
        $authorizationRequest = $consentService->pendingAuthorizationRequest($this);

        return $authorizationRequest === null
            ? []
            : $consentService->offeredScopes($consentService->requestedScopeValues($authorizationRequest));
    }

    /**
     * @param  Closure(string): mixed  $fail
     */
    private function userMayGrantScope(string $attribute, mixed $value, Closure $fail): void
    {
        $scope = is_string($value) ? ApiKeyScopeEnum::tryFrom($value) : null;
        $user = $this->user();

        if ($scope === null || ! $user instanceof User) {
            return;
        }

        if (! app(EffectivePermissionResolverService::class)->canGrantScope($user, $scope)) {
            $fail(__('You cannot grant the :scope scope: you do not hold it yourself.', ['scope' => $scope->value]));
        }
    }
}
