<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\FilePermissionActionEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccessTrait;
use App\Support\Files\FilesDisk;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates `POST /api/v1/files`: the upload, its target folder, display name and an allowed disk.
 */
class StoreFileRequest extends FormRequest
{
    use AuthorizesFileAccessTrait;

    /**
     * Role file ACL ∩ key scopes must allow creating files (403), before the upload is validated.
     */
    public function authorize(): bool
    {
        $this->authorizeFile($this, FilePermissionActionEnum::Create);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'disk' => ['nullable', 'string', Rule::in(FilesDisk::allowed())],
        ];
    }
}
