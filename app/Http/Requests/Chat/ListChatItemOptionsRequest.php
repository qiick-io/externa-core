<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Services\Validation\SearchQueryRulesService;
use App\Services\Validation\StringLimitsService;
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
            'q' => SearchQueryRulesService::search(StringLimitsService::SEARCH_CHAT_HUB),
        ];
    }
}
