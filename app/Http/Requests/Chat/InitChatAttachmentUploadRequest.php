<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the start of a chunked chat attachment upload: file name, total
 * size, chunk count and the optional MIME type.
 */
class InitChatAttachmentUploadRequest extends FormRequest
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
            'file_name' => ['required', 'string', 'max:255'],
            'total_size' => ['required', 'integer', 'min:1'],
            'total_chunks' => ['required', 'integer', 'min:1'],
            'mime_type' => ['nullable', 'string', 'max:255'],
        ];
    }
}
