<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates one chunk of a chunked chat attachment upload.
 */
class UploadChatAttachmentChunkRequest extends FormRequest
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
            'chunk_index' => ['required', 'integer', 'min:0'],
            'chunk' => ['required', 'file'],
        ];
    }
}
