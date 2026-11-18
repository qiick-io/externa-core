<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a single-request file upload into the admin file manager.
 *
 * The size caps (project setting and PHP upload limits) are checked by the controller
 * after validation, because they depend on the uploaded file's real size.
 */
class UploadFileRequest extends FormRequest
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
            'file' => ['required', 'file'],
            'parent_id' => $this->parentIdRules(),
            'disk' => $this->diskRules(),
            'name' => ['nullable', 'string', 'max:255'],
        ];
    }
}
