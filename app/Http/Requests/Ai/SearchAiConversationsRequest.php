<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Support\Validation\SearchQueryRules;
use App\Support\Validation\StringLimits;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the `q` title filter of the chat hub conversation list.
 *
 * Every AI user may list their own conversations, so `authorize()` allows the request;
 * the controller scopes the query to the current user.
 */
class SearchAiConversationsRequest extends FormRequest
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
            'q' => SearchQueryRules::search(StringLimits::SEARCH_CHAT_HUB),
        ];
    }
}
