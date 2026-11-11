<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the bounded list of conversation ids to delete in one call.
 *
 * Ownership of every id is checked by the controller after validation (404 when any id is not owned),
 * so `authorize()` allows the request.
 */
class BulkDestroyAiConversationsRequest extends FormRequest
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
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['required', 'string', 'uuid'],
        ];
    }
}
