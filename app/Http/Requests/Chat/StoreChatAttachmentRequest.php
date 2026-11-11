<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a single-request chat attachment upload, stored as an orphan
 * until a message claims it.
 */
class StoreChatAttachmentRequest extends FormRequest
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
            'file' => ['required', 'file'],
        ];
    }
}
