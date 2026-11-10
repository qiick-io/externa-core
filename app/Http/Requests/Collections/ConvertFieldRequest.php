<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a field type / translatable conversion request (#220).
 */
class ConvertFieldRequest extends FormRequest
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
            'type' => ['required', Rule::enum(FieldTypeEnum::class)],
            'translatable' => ['sometimes', 'boolean'],
            'locale' => ['nullable', 'string', 'max:32'],
            'dry_run' => ['sometimes', 'boolean'],
            'create_missing_options' => ['sometimes', 'boolean'],
            'option_mapping' => ['sometimes', 'array'],
            'option_mapping.*' => ['string', 'max:255'],
            'settings' => ['sometimes', 'array'],
            'sync' => ['sometimes', 'boolean'],
        ];
    }
}
