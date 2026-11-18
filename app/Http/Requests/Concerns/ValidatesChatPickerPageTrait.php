<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Services\Validation\SearchQueryRulesService;
use App\Services\Validation\StringLimitsService;

/**
 * Search and paging rules shared by the chat hub pickers (people directory
 * and item picker), which page their merged rows in memory.
 */
trait ValidatesChatPickerPageTrait
{
    /**
     * @return array<string, mixed>
     */
    protected function chatPickerPageRules(): array
    {
        return [
            'q' => SearchQueryRulesService::search(StringLimitsService::SEARCH_CHAT_HUB),
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }
}
