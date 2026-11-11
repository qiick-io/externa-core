<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the `upload_id` that identifies a chunked chat attachment upload,
 * shared by completing the upload and reading its status.
 */
class FindChatAttachmentUploadRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;

    public function authorize(): bool
    {
        $this->authorizeAttachmentUploadContext();

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'upload_id' => ['required', 'string', 'max:64'],
        ];
    }
}
