<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\FilePermissionActionEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates `GET /api/v1/files`: folder, search and paging (page size capped by `api.max_per_page`).
 */
class ListFilesRequest extends FormRequest
{
    use AuthorizesFileAccessTrait;

    /**
     * Role file ACL ∩ key scopes must allow reading files (403), before the query is validated.
     */
    public function authorize(): bool
    {
        $this->authorizeFile($this, FilePermissionActionEnum::Read);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.max(1, (int) config('api.max_per_page', 100))],
        ];
    }
}
