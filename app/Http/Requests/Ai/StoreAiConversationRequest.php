<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the optional title of a new AI chat conversation.
 *
 * Conversations always belong to the current user, so `authorize()` allows the request.
 */
class StoreAiConversationRequest extends FormRequest
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
            'title' => ['nullable', 'string', 'max:100'],
        ];
    }
}
