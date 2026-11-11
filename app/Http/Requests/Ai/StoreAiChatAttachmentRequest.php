<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\AiChatAttachment;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a temporary AI chat attachment upload (presence and size cap).
 *
 * Extension and sniffed MIME checks stay in the controller because they read the file contents.
 * Access is gated by the route middleware, so `authorize()` allows the request.
 */
class StoreAiChatAttachmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:'.(AiChatAttachment::MAX_BYTES / 1024)],
        ];
    }
}
