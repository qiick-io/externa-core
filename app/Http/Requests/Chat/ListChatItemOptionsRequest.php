<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Support\Validation\SearchQueryRules;
use App\Support\Validation\StringLimits;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the item option search of the new-thread dialog: the collection
 * and an optional search. Read access to the collection and items is checked
 * by the controller once the collection is loaded.
 */
class ListChatItemOptionsRequest extends FormRequest
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
            'collection_id' => ['required', 'integer', 'exists:collections,id'],
            'q' => SearchQueryRules::search(StringLimits::SEARCH_CHAT_HUB),
        ];
    }
}
