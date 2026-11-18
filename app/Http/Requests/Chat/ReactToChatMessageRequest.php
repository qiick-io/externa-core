<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates toggling an emoji reaction on a message. The controller still
 * checks the emoji against the allowed set and answers with its own message.
 */
class ReactToChatMessageRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;

    public function authorize(): bool
    {
        $this->authorizeChatMessage(mustBeAuthor: false);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'emoji' => ['required', 'string', 'max:16'],
        ];
    }
}
