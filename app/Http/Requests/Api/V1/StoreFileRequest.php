<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\File;
use App\Services\Files\FilesDiskService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Validates `POST /api/v1/files`: the upload, its target folder, display name and an allowed disk.
 */
class StoreFileRequest extends FormRequest
{
    /**
     * Role file ACL ∩ key scopes must allow creating files (403), before the upload is validated.
     */
    public function authorize(): bool
    {
        Gate::authorize('create', File::class);

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
            'disk' => ['nullable', 'string', Rule::in(FilesDiskService::allowed())],
        ];
    }
}
