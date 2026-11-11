<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Models\File;
use App\Services\FileTransformService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a thumbnail or named transform request for an image file.
 *
 * Non-image targets are rejected with a plain 422 before the query rules run, so they
 * keep getting the "only available for image files" response instead of field errors.
 */
class ShowFileThumbnailRequest extends FormRequest
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
            'size' => ['nullable', 'integer', 'min:1', 'max:'.app(FileTransformService::class)->maxSize()],
            'key' => ['nullable', 'string', 'max:64'],
        ];
    }

    /**
     * Abort with 422 when the route-bound file is not an image.
     */
    protected function prepareForValidation(): void
    {
        $targetFile = $this->route('file');

        if ($targetFile instanceof File && ! app(FileTransformService::class)->isImage($targetFile)) {
            abort(422, __('Thumbnails are only available for image files.'));
        }
    }
}
