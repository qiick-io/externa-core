<?php

namespace App\Http\Requests\Collections;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Services\Collections\FieldPacks\FieldPackRegistryService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Thin authorize + pack-key validation for applying a field pack.
 */
class ApplyFieldPackRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanEditCollections->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Route param mirrored for Rule::in; prepareForValidation merges it.
            'pack' => ['required', 'string', Rule::in(FieldPackRegistryService::keys())],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'pack' => (string) $this->route('pack'),
        ]);
    }
}
