<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the cursor (`before_id`) and page size of a thread's message list,
 * on the hub route and on the item-form alias (including the empty list an
 * item shows before its thread exists).
 */
class ListChatMessagesRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;

    public const DEFAULT_PER_PAGE = 20;

    public const MAX_PER_PAGE = 100;

    public function authorize(): bool
    {
        $this->authorizeChatOrItemThread();

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'before_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ];
    }
}
