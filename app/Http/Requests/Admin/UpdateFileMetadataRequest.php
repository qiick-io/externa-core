<?php

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateFileMetadataRequest extends FormRequest
{
    use AuthorizesWithPermission;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanUpdateFileMetadata->value);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'location' => ['nullable', 'string', 'max:255'],
            'download_name' => ['nullable', 'string', 'max:255'],
            'focal_point_x' => ['nullable', 'numeric', 'between:-9999.999999,9999.999999'],
            'focal_point_y' => ['nullable', 'numeric', 'between:-9999.999999,9999.999999'],
            'translate_x' => ['nullable', 'numeric', 'between:-9999.999999,9999.999999'],
            'translate_y' => ['nullable', 'numeric', 'between:-9999.999999,9999.999999'],
            'scale' => ['nullable', 'numeric', 'between:0,9999.999999'],
        ];
    }
}
