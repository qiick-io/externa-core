<?php

namespace App\Support\Validation;

/**
 * Reusable Laravel validation rules for list/search query params.
 */
final class SearchQueryRules
{
    /**
     * @return list<string>
     */
    public static function search(int $max = StringLimits::SEARCH): array
    {
        return ['nullable', 'string', 'max:'.$max];
    }

    /**
     * @return array<string, list<string>>
     */
    public static function rules(string $key = 'search', int $max = StringLimits::SEARCH): array
    {
        return [$key => self::search($max)];
    }
}
