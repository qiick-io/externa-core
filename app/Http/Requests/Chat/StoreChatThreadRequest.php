<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Models\Chat;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates opening a chat thread from the hub: an item thread (collection
 * and item) or a direct chat (users and groups). The permission depends on
 * the validated `kind`, so the controller checks it after validation.
 */
class StoreChatThreadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in([Chat::KIND_ITEM, Chat::KIND_DIRECT])],
            'collection_id' => ['required_if:kind,item', 'nullable', 'integer', 'exists:collections,id'],
            'item_id' => ['required_if:kind,item', 'nullable', 'integer', 'exists:collections_items,id'],
            'user_ids' => ['required_if:kind,direct', 'nullable', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'group_ids' => ['nullable', 'array'],
            'group_ids.*' => ['integer', 'exists:user_groups,id'],
        ];
    }
}
