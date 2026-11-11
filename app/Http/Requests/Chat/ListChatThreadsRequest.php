<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Support\Validation\SearchQueryRules;
use App\Support\Validation\StringLimits;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the chat hub thread list filters: tab, search, collection,
 * archived direct chats and page size. Item-level ACLs are applied by the
 * chat service while listing, so any signed-in user may ask.
 */
class ListChatThreadsRequest extends FormRequest
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
            'tab' => ['nullable', Rule::in(['collection', 'private'])],
            'q' => SearchQueryRules::search(StringLimits::SEARCH_CHAT_HUB),
            'collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'archived' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }
}
