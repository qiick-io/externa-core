<?php

declare(strict_types=1);

namespace App\Services\Validation;

/**
 * Reusable Laravel validation rules for list/search query params.
 */
final class SearchQueryRulesService
{
    /**
     * @return list<string>
     */
    public static function search(int $max = StringLimitsService::SEARCH): array
    {
        return ['nullable', 'string', 'max:'.$max];
    }

    /**
     * @return array<string, list<string>>
     */
    public static function rules(string $key = 'search', int $max = StringLimitsService::SEARCH): array
    {
        return [$key => self::search($max)];
    }
}
