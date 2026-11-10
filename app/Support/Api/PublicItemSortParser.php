<?php

namespace App\Support\Api;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Api\CollectionPermissionRulesService;
use App\Services\Collections\CollectionItemQueryService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Parse and validate Public CMS API `sort` tokens (REST CSV / GraphQL list).
 *
 * Tokens: `published_at`, `-title` (− prefix = desc). Max 3 keys.
 *
 * @phpstan-type SortKey array{name: string, direction: 'asc'|'desc', field: ?CollectionField}
 */
final class PublicItemSortParser
{
    public const MAX_KEYS = 3;

    /** @var list<string> */
    public const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at', 'published_at'];

    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private CollectionPermissionRulesService $rulesService,
    ) {}

    /**
     * Parse REST `?sort=-published_at,title` (empty / missing → []).
     *
     * @return list<SortKey>
     */
    public function parseRest(Request $request, Collection $collection): array
    {
        $raw = $request->query('sort');

        if ($raw === null || $raw === '') {
            return [];
        }

        if (! is_string($raw)) {
            throw ValidationException::withMessages([
                'sort' => __('The sort parameter must be a comma-separated string of field names.'),
            ]);
        }

        return $this->resolveTokens($this->splitCsv($raw), $request, $collection);
    }

    /**
     * Parse GraphQL `sort: [String!]` (null / empty → []).
     *
     * @param  list<mixed>|null  $tokens
     * @return list<SortKey>
     */
    public function parseGraphQl(?array $tokens, Request $request, Collection $collection): array
    {
        if ($tokens === null || $tokens === []) {
            return [];
        }

        $normalized = [];
        foreach ($tokens as $token) {
            if (! is_string($token)) {
                throw ValidationException::withMessages([
                    'sort' => __('Each sort token must be a string.'),
                ]);
            }
            $normalized[] = $token;
        }

        return $this->resolveTokens($normalized, $request, $collection);
    }

    /**
     * Stable cache key for resolved sort (empty string when default).
     *
     * @param  list<SortKey>  $keys
     */
    public function cacheKey(array $keys): string
    {
        if ($keys === []) {
            return '';
        }

        return implode(',', array_map(
            fn (array $key): string => ($key['direction'] === 'desc' ? '-' : '').$key['name'],
            $keys,
        ));
    }

    /**
     * @param  list<string>  $tokens
     * @return list<SortKey>
     */
    private function resolveTokens(array $tokens, Request $request, Collection $collection): array
    {
        if (count($tokens) > self::MAX_KEYS) {
            throw ValidationException::withMessages([
                'sort' => __('A maximum of :max sort keys is allowed.', ['max' => self::MAX_KEYS]),
            ]);
        }

        $collection->loadMissing('fields');
        $rules = $this->permissionEnforcer->resolveRules($request, $collection);
        $keys = [];

        foreach ($tokens as $token) {
            $token = trim($token);
            if ($token === '' || $token === '-') {
                throw ValidationException::withMessages([
                    'sort' => __('Sort tokens must not be empty.'),
                ]);
            }

            $direction = 'asc';
            $name = $token;
            if (str_starts_with($token, '-')) {
                $direction = 'desc';
                $name = substr($token, 1);
            }

            if ($name === '' || ! preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
                throw ValidationException::withMessages([
                    'sort' => __('Invalid sort token [:token].', ['token' => $token]),
                ]);
            }

            if (in_array($name, self::SYSTEM_COLUMNS, true)) {
                $keys[] = ['name' => $name, 'direction' => $direction, 'field' => null];

                continue;
            }

            $field = $collection->fields->firstWhere('name', $name);
            if (! $field instanceof CollectionField) {
                throw ValidationException::withMessages([
                    'sort' => __('Unknown sort field [:name].', ['name' => $name]),
                ]);
            }

            if (! $this->itemQueryService->isPubliclySortableField($field)) {
                throw ValidationException::withMessages([
                    'sort' => __('Field [:name] is not sortable.', ['name' => $name]),
                ]);
            }

            if ($rules !== null && ! $this->rulesService->isFieldAllowed($rules, $name, 'read')) {
                throw ValidationException::withMessages([
                    'sort' => __('Field [:name] is not readable for this role.', ['name' => $name]),
                ]);
            }

            $keys[] = ['name' => $name, 'direction' => $direction, 'field' => $field];
        }

        return $keys;
    }

    /**
     * @return list<string>
     */
    private function splitCsv(string $raw): array
    {
        $parts = array_map(trim(...), explode(',', $raw));

        return array_values(array_filter($parts, fn (string $part): bool => $part !== ''));
    }
}
