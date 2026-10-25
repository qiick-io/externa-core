<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate creating a project API key.
 */
class StoreApiKeyRequest extends FormRequest
{
    use AuthorizesWithPermission;

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
            'ip_allowlist' => ['nullable', 'array'],
            'ip_allowlist.*' => ['string', 'max:64'],
            'rate_limit_per_minute' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'expires_at' => ['nullable', 'date', 'after:now'],
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
    }
}
