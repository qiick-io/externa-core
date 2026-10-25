<?php

namespace App\Http\Requests\Collections;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Models\Collection;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates bulk delete / restore / force-delete against collection items.
 */
class BulkItemActionRequest extends FormRequest
{
    use AuthorizesWithPermission;

    /**
     * Require the permission that matches the requested bulk action.
     */
    public function authorize(): bool
    {
        $permission = match ($this->input('action')) {
            'restore' => PermissionEnum::CanRestoreCollections->value,
            'force_delete' => PermissionEnum::CanForceDeleteCollections->value,
            default => PermissionEnum::CanDeleteCollections->value,
        };

        $this->authorizePermission($permission);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var Collection $collection */
        $collection = $this->route('collection');

        return [
            'action' => ['required', 'string', Rule::in(['delete', 'restore', 'force_delete'])],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => [
                'integer',
                Rule::exists('collections_items', 'id')->where(
                    'collection_id',
                    $collection->id,
                ),
            ],
        ];
    }
}
