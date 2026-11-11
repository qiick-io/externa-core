<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\FilePermissionActionEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccessTrait;
use App\Models\File;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates `PATCH /api/v1/files/{id}`: a partial update of the name and descriptive metadata.
 *
 * Every field is `sometimes`, so only the keys the client sends are validated and written.
 */
class UpdateFileRequest extends FormRequest
{
    use AuthorizesFileAccessTrait;

    private ?File $targetFile = null;

    /**
     * Role file ACL ∩ key scopes must allow updating files (403), then the file must exist (404).
     */
    public function authorize(): bool
    {
        $this->authorizeFile($this, FilePermissionActionEnum::Update);

        $file = File::query()->find((int) $this->route('id'));
        if ($file === null) {
            abort(404);
        }

        $this->targetFile = $file;

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'download_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'focal_point_x' => ['sometimes', 'nullable', 'numeric', 'between:0,1'],
            'focal_point_y' => ['sometimes', 'nullable', 'numeric', 'between:0,1'],
            'name' => ['sometimes', 'string', 'max:255'],
        ];
    }

    /**
     * The `{id}` file found in `authorize()`.
     */
    public function targetFile(): File
    {
        if ($this->targetFile === null) {
            abort(404);
        }

        return $this->targetFile;
    }
}
