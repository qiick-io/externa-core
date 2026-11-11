<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the files to bundle into a queued zip download.
 */
class DownloadFilesRequest extends FormRequest
{
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
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:files,id'],
        ];
    }
}
