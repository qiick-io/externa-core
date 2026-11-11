<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates starting a resumable chunked upload session.
 *
 * The project upload size cap is checked by the controller after validation.
 */
class InitChunkUploadRequest extends FormRequest
{
    use ValidatesFileManagerFieldsTrait;

    /**
     * File manager access is already gated by the `can.manage.files` route middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'file_name' => ['required', 'string', 'max:255'],
            'total_size' => ['required', 'integer', 'min:1'],
            'total_chunks' => ['required', 'integer', 'min:1'],
            'mime_type' => ['nullable', 'string', 'max:255'],
            'parent_id' => $this->parentIdRules(),
            'disk' => $this->diskRules(),
        ];
    }
}
