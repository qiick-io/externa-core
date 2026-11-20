<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Enums\ApiKeyScopeEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\User;
use App\Rules\IpAllowlistEntryRule;
use App\Services\Authorization\EffectivePermissionResolverService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Validate creating a project API key.
 *
 * Scopes are the only permission input: values of {@see ApiKeyScopeEnum}, at least one, and
 * each one held by the person creating the key (a key never holds more than its creator;
 * {@see ApiKeyScopeEnum::requiredCreatorPermissions()}). Key management is a session route:
 * an API key cannot reach it, so a key can never mint or widen another key.
 */
class StoreApiKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        abort_unless(Gate::allows('create', ApiKey::class), 403);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'role_id' => [
                'required',
                'integer',
                Rule::exists('roles', 'id')->where(fn ($query) => $query->where('name', '!=', RoleEnum::SuperAdmin->value)),
            ],
            'collection_slugs' => ['nullable', 'array'],
            'collection_slugs.*' => ['string', 'max:128', 'distinct'],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => ['string', 'distinct', Rule::enum(ApiKeyScopeEnum::class), $this->creatorHoldsScope(...)],
            'ip_allowlist' => ['nullable', 'array'],
            'ip_allowlist.*' => ['string', 'max:64', new IpAllowlistEntryRule],
            'rate_limit_per_minute' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'owner_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query
                    ->where('is_active', true)
                    ->whereNull('deleted_at')),
            ],
        ];
    }

    /**
     * Refuse a scope whose permissions the creator does not hold right now.
     *
     * @param  Closure(string): mixed  $fail
     */
    private function creatorHoldsScope(string $attribute, mixed $value, Closure $fail): void
    {
        $scope = is_string($value) ? ApiKeyScopeEnum::tryFrom($value) : null;
        $creator = $this->user();

        if ($scope === null) {
            return;
        }

        if (! $creator instanceof User) {
            $fail(__('Only a signed-in user can issue an API key.'));

            return;
        }

        if (! app(EffectivePermissionResolverService::class)->canGrantScope($creator, $scope)) {
            $fail(__('You cannot issue a key with the :scope scope: you do not hold it yourself.', [
                'scope' => $scope->value,
            ]));
        }
    }

    protected function prepareForValidation(): void
    {
        $list = $this->input('ip_allowlist');
        if (is_string($list)) {
            $parts = preg_split('/[\s,]+/', $list) ?: [];
            $this->merge([
                'ip_allowlist' => array_values(array_filter(array_map('trim', $parts))),
            ]);
        }

        $slugs = $this->input('collection_slugs');
        if (is_string($slugs)) {
            $parts = preg_split('/[\s,]+/', $slugs) ?: [];
            $normalized = array_values(array_unique(array_filter(array_map(
                static fn (string $slug): string => strtolower(trim($slug)),
                $parts,
            ))));
            $this->merge([
                'collection_slugs' => $normalized === [] ? null : $normalized,
            ]);
        } elseif (is_array($slugs) && $slugs === []) {
            $this->merge(['collection_slugs' => null]);
        }
    }
}
