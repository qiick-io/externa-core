<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate creating a project API key.
 */
class StoreApiKeyRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanManageApiKeys->value);

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
            'read_only' => ['sometimes', 'boolean'],
            'ip_allowlist' => ['nullable', 'array'],
            'ip_allowlist.*' => ['string', 'max:64'],
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

        if ($this->has('read_only')) {
            $this->merge(['read_only' => $this->boolean('read_only')]);
        }
    }
}
