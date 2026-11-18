<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Models\File;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

/**
 * Validates replacing a file's binary content with a new upload.
 *
 * Folders cannot be replaced. That guard runs before the payload rules, so a folder
 * target reports "Only files can be replaced." even when no upload was sent. The
 * extension / mime compatibility check needs the stored file and stays in the controller.
 */
class ReplaceFileRequest extends FormRequest
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
            'file' => ['required', 'file'],
        ];
    }

    /**
     * Reject folder targets before validating the upload.
     *
     * @throws ValidationException when the route-bound target is not a file
     */
    protected function prepareForValidation(): void
    {
        $targetFile = $this->route('file');

        if ($targetFile instanceof File && ! $targetFile->isFile()) {
            throw ValidationException::withMessages([
                'file' => [__('Only files can be replaced.')],
            ]);
        }
    }
}
