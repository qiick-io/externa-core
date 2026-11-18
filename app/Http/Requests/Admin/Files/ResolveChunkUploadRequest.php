<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the `upload_id` that identifies a chunked upload session.
 *
 * Shared by completing an upload and reading its status, which take exactly the same input.
 */
class ResolveChunkUploadRequest extends FormRequest
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
            'upload_id' => ['required', 'string', 'max:64'],
        ];
    }
}
