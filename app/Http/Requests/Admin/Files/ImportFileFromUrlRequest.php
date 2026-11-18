<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates importing a remote URL into the admin file manager.
 *
 * Only the payload shape is checked here; the SSRF check and the download itself run
 * in the controller after validation.
 */
class ImportFileFromUrlRequest extends FormRequest
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
            'url' => ['required', 'string', 'max:2048'],
            'parent_id' => $this->parentIdRules(),
            'name' => ['nullable', 'string', 'max:255'],
        ];
    }
}
