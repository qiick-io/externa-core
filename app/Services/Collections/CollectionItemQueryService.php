<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Validation\FilterQueryLimitsService;
use App\Services\Validation\StringLimitsService;
use App\Support\Api\PublicItemSortParser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Applies field-based filters and sort to collection item listing queries.
 *
 * Filter dialect (query string or GraphQL JSON):
 * - `filter[title]=foo` → contains (LIKE) — backward compatible
 * - `filter[title][_eq]=foo`, `_neq`, `_contains`, `_null=1`, `_nnull=1`
 * - `filter[count][_gte]=1`, `_lte`, `_gt`, `_lt`
 * - `filter[status][_in]=a,b,c` or array
 * - System columns: `filter[published_at][_gte]=2026-01-01`, `filter[id][_in]=1,2`
 *   ({@see self::SYSTEM_FILTER_COLUMNS}); system keys win over a same-named
 *   collection field; unsupported operators / invalid values → 422
 * - Depth-1 relational: `filter[author.name][_eq]=Ada` (hard cap
 *   {@see StringLimitsService::FILTER_MAX_RELATION_DEPTH}); deeper paths → 422
 *
 * When a {@see Request} is provided (Public REST/GraphQL), relational filters
 * require the related collection to be readable via
 * {@see CollectionPermissionEnforcerService} (same gate as `?include=`). An
 * unreadable related collection yields no matches (no value leak).
 *
 * Permission item_filter operators (equals|not_equals|empty|not_empty) map onto this dialect.
 */
class CollectionItemQueryService
{
    /** @var list<string> */
    public const SYSTEM_SORT_COLUMNS = ['id', 'created_at', 'updated_at', 'board_sort'];

    /**
     * Public/API filterable system columns on `collections_items`
     * (same allowlist as {@see PublicItemSortParser::SYSTEM_COLUMNS}).
     *
     * @var list<string>
     */
    public const SYSTEM_FILTER_COLUMNS = ['id', 'created_at', 'updated_at', 'published_at'];

    /** @var list<string> */
    public const ID_FILTER_OPERATORS = [
        '_eq', '_neq', '_in', '_gt', '_gte', '_lt', '_lte',
    ];

    /** @var list<string> */
    public const DATETIME_FILTER_OPERATORS = [
        '_eq', '_gt', '_gte', '_lt', '_lte', '_null', '_nnull',
    ];

    /** @var list<string> */
    public const OPERATORS = [
        '_eq', '_neq', '_contains', '_in', '_null', '_nnull',
        '_gt', '_gte', '_lt', '_lte',
    ];

    /** @var array<string, string> */
    public const PERMISSION_OPERATOR_MAP = [
        'equals' => '_eq',
        'not_equals' => '_neq',
        'empty' => '_null',
        'not_empty' => '_nnull',
    ];

    public function __construct(
        private CollectionLocaleResolverService $localeResolver,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @param  Builder<CollectionItem>  $query
     */
    public function applyFilters(
        Builder $query,
        Collection $collection,
        array $filters,
        ?string $locale = null,
        ?Request $request = null,
    ): Builder {
        $filters = FilterQueryLimitsService::assertValid($filters);

        $collection->loadMissing('fields');
        $fieldsByName = $collection->fields->keyBy('name');
        $locale ??= $this->localeResolver->resolve();

        foreach ($filters as $fieldName => $value) {
            if (! is_string($fieldName) || $fieldName === '') {
                continue;
            }

            if (str_contains($fieldName, '.')) {
                $this->applyRelationalPathFilter(
                    $query,
                    $collection,
                    $fieldName,
                    $value,
                    $locale,
                    $request,
                );

                continue;
            }

            // System columns win over a collection field with the same name.
            if (in_array($fieldName, self::SYSTEM_FILTER_COLUMNS, true)) {
                $this->applySystemFieldFilter($query, $fieldName, $value);

                continue;
            }

            $field = $fieldsByName->get($fieldName);
            if (! $field instanceof CollectionField) {
                continue;
            }

            $ops = $this->normalizeFieldFilter($value);
            if ($ops === []) {
                continue;
            }

            foreach ($ops as $operator => $operand) {
                $this->applyOperator($query, $field, $operator, $operand, $locale);
            }
        }

        return $query;
    }

    /**
     * Apply a system-column filter (`id` / timestamps) on `collections_items`.
     *
     * @param  Builder<CollectionItem>  $query
     *
     * @throws ValidationException
     */
    private function applySystemFieldFilter(Builder $query, string $column, mixed $value): void
    {
        $ops = $this->normalizeFieldFilter($value);
        if ($ops === []) {
            return;
        }

        $allowed = $column === 'id'
            ? self::ID_FILTER_OPERATORS
            : self::DATETIME_FILTER_OPERATORS;

        foreach ($ops as $operator => $operand) {
            if (! in_array($operator, $allowed, true)) {
                throw ValidationException::withMessages([
                    "filter.{$column}" => "Operator [{$operator}] is not supported for system field [{$column}].",
                ]);
            }

            if ($column === 'id') {
                $this->applySystemIdOperator($query, $operator, $operand);

                continue;
            }

            $this->applySystemDateTimeOperator($query, $column, $operator, $operand);
        }
    }

    /**
     * @param  Builder<CollectionItem>  $query
     *
     * @throws ValidationException
     */
    private function applySystemIdOperator(Builder $query, string $operator, mixed $operand): void
    {
        if ($operator === '_in') {
            $ids = $this->parseSystemIdList($operand, 'filter.id._in');
            if ($ids === []) {
                $query->whereRaw('1 = 0');

                return;
            }

            $query->whereIn('id', $ids);

            return;
        }

        $id = $this->parseSystemIdScalar($operand, "filter.id.{$operator}");

        match ($operator) {
            '_eq' => $query->where('id', '=', $id),
            '_neq' => $query->where('id', '<>', $id),
            '_gt' => $query->where('id', '>', $id),
            '_gte' => $query->where('id', '>=', $id),
            '_lt' => $query->where('id', '<', $id),
            '_lte' => $query->where('id', '<=', $id),
            default => throw ValidationException::withMessages([
                'filter.id' => "Operator [{$operator}] is not supported for system field [id].",
            ]),
        };
    }

    /**
     * @param  Builder<CollectionItem>  $query
     *
     * @throws ValidationException
     */
    private function applySystemDateTimeOperator(
        Builder $query,
        string $column,
        string $operator,
        mixed $operand,
    ): void {
        if ($operator === '_null') {
            if ($this->isTruthyFilterFlag($operand)) {
                $query->whereNull($column);
            }

            return;
        }

        if ($operator === '_nnull') {
            if ($this->isTruthyFilterFlag($operand)) {
                $query->whereNotNull($column);
            }

            return;
        }

        $instant = $this->parseSystemDateTime($operand, "filter.{$column}.{$operator}");

        match ($operator) {
            '_eq' => $query->where($column, '=', $instant),
            '_gt' => $query->where($column, '>', $instant),
            '_gte' => $query->where($column, '>=', $instant),
            '_lt' => $query->where($column, '<', $instant),
            '_lte' => $query->where($column, '<=', $instant),
            default => throw ValidationException::withMessages([
                "filter.{$column}" => "Operator [{$operator}] is not supported for system field [{$column}].",
            ]),
        };
    }

    /**
     * Parse ISO-8601 datetime (date-only = start of that day, UTC).
     *
     * @throws ValidationException
     */
    private function parseSystemDateTime(mixed $operand, string $attribute): Carbon
    {
        if (! is_string($operand) && ! is_numeric($operand)) {
            throw ValidationException::withMessages([
                $attribute => 'System datetime filter values must be ISO 8601 strings.',
            ]);
        }

        $raw = trim((string) $operand);
        if ($raw === '') {
            throw ValidationException::withMessages([
                $attribute => 'System datetime filter values must be ISO 8601 strings.',
            ]);
        }

        try {
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) === 1) {
                $parsed = Carbon::createFromFormat('Y-m-d', $raw, 'UTC');
                if ($parsed === null || $parsed->format('Y-m-d') !== $raw) {
                    throw new \InvalidArgumentException('Invalid date.');
                }

                return $parsed->startOfDay();
            }

            return Carbon::parse($raw, 'UTC')->utc();
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                $attribute => 'System datetime filter values must be valid ISO 8601 timestamps.',
            ]);
        }
    }

    /**
     * @throws ValidationException
     */
    private function parseSystemIdScalar(mixed $operand, string $attribute): int
    {
        if (is_bool($operand) || is_array($operand) || $operand === null || $operand === '') {
            throw ValidationException::withMessages([
                $attribute => 'System id filter values must be integers.',
            ]);
        }

        if (is_int($operand)) {
            return $operand;
        }

        if (is_string($operand) && preg_match('/^-?\d+$/', trim($operand)) === 1) {
            return (int) trim($operand);
        }

        if (is_float($operand) && floor($operand) === $operand) {
            return (int) $operand;
        }

        throw ValidationException::withMessages([
            $attribute => 'System id filter values must be integers.',
        ]);
    }

    /**
     * @return list<int>
     *
     * @throws ValidationException
     */
    private function parseSystemIdList(mixed $operand, string $attribute): array
    {
        if (is_array($operand)) {
            $parts = array_values($operand);
        } elseif (is_string($operand) || is_numeric($operand)) {
            $parts = array_values(array_filter(
                array_map('trim', explode(',', (string) $operand)),
                fn (string $part): bool => $part !== '',
            ));
        } else {
            throw ValidationException::withMessages([
                $attribute => 'System id _in values must be a comma-separated list or array of integers.',
            ]);
        }

        $ids = [];
        foreach ($parts as $index => $part) {
            $ids[] = $this->parseSystemIdScalar($part, $attribute.'.'.$index);
        }

        return $ids;
    }

    private function isTruthyFilterFlag(mixed $operand): bool
    {
        return filter_var($operand, FILTER_VALIDATE_BOOLEAN)
            || $operand === '1'
            || $operand === 1
            || $operand === true;
    }

    /**
     * Apply a depth-1 dotted filter (`relation.relatedField`) via EXISTS/IN subqueries.
     *
     * @param  Builder<CollectionItem>  $query
     */
    private function applyRelationalPathFilter(
        Builder $query,
        Collection $collection,
        string $path,
        mixed $value,
        string $locale,
        ?Request $request,
    ): void {
        $parts = explode('.', $path);
        if (count($parts) !== StringLimitsService::FILTER_MAX_RELATION_DEPTH + 1) {
            return;
        }

        [$relationName, $relatedFieldName] = $parts;

        $collection->loadMissing('fields');
        $relationField = $collection->fields->firstWhere('name', $relationName);
        if (! $relationField instanceof CollectionField) {
            return;
        }

        $relationType = $relationField->type;
        if (! $relationType->isRelationType()) {
            return;
        }

        $relatedCollectionId = (int) data_get($relationField->settings, 'related_collection_id');
        if ($relatedCollectionId <= 0) {
            return;
        }

        $relatedCollection = Collection::query()
            ->with(['fields' => fn ($q) => $q->ordered()])
            ->find($relatedCollectionId);

        if (! $relatedCollection instanceof Collection) {
            return;
        }

        $relatedField = $relatedCollection->fields->firstWhere('name', $relatedFieldName);
        if (! $relatedField instanceof CollectionField) {
            return;
        }

        $ops = $this->normalizeFieldFilter($value);
        if ($ops === []) {
            return;
        }

        if ($request !== null) {
            $enforcer = app(CollectionPermissionEnforcerService::class);
            if (! $enforcer->isCollectionReadable($request, $relatedCollection)) {
                // raw-sql: reviewed — deny-match when related collection is not readable (no leak)
                $query->whereRaw('1 = 0');

                return;
            }
        }

        $relatedIdsQuery = CollectionItem::query()
            ->where('collection_id', $relatedCollection->id)
            ->select('collections_items.id');

        // Scalar filter on the related collection only (no Request → no nested permission re-entry).
        $this->applyFilters($relatedIdsQuery, $relatedCollection, [$relatedFieldName => $value], $locale, null);

        if ($request !== null) {
            app(CollectionPermissionEnforcerService::class)
                ->applyItemFilterToQuery($request, $relatedCollection, $relatedIdsQuery);
        }

        if ($relationType->isMultipleRelationType()) {
            $this->applyMultipleRelationIdMatch($query, $relationField, $relatedIdsQuery);

            return;
        }

        $this->applyManyToOneRelationIdMatch($query, $relationField, $relatedIdsQuery);
    }

    /**
     * Match parent M2O field values whose JSON scalar id is in the related-ids subquery.
     *
     * The stored id is compared numerically so PostgreSQL does not reject `text = bigint`.
     *
     * @param  Builder<CollectionItem>  $query
     * @param  Builder<CollectionItem>  $relatedIdsQuery
     */
    private function applyManyToOneRelationIdMatch(
        Builder $query,
        CollectionField $relationField,
        Builder $relatedIdsQuery,
    ): void {
        $query->whereHas('fieldValues', function (Builder $fv) use ($relationField, $relatedIdsQuery): void {
            $fv->where('field_id', $relationField->id)
                ->where('position', 0)
                ->whereNull('locale');

            // raw-sql: reviewed — relational deep filter; subquery bindings rebound; SQL from driver helpers
            $fv->whereRaw(
                $this->valueNumericSql().' IN ('.$relatedIdsQuery->toSql().')',
                $relatedIdsQuery->getBindings(),
            );
        });
    }

    /**
     * Match parent M2M/O2M links whose `related_item_id` is in the related-ids subquery.
     *
     * Array storage writes one `{"related_item_id": N, "meta": {...}}` row per position,
     * so every position is checked and the id is compared as an integer (1 never matches 12 or 100).
     *
     * @param  Builder<CollectionItem>  $query
     * @param  Builder<CollectionItem>  $relatedIdsQuery
     */
    private function applyMultipleRelationIdMatch(
        Builder $query,
        CollectionField $relationField,
        Builder $relatedIdsQuery,
    ): void {
        $query->whereHas('fieldValues', function (Builder $fv) use ($relationField, $relatedIdsQuery): void {
            $fv->where('field_id', $relationField->id)
                ->whereNull('locale');

            // raw-sql: reviewed — M2M deep filter; subquery bindings rebound; SQL from driver helper
            $fv->whereRaw(
                $this->valueRelatedItemIdSql().' IN ('.$relatedIdsQuery->toSql().')',
                $relatedIdsQuery->getBindings(),
            );
        });
    }

    /**
     * Integer `related_item_id` of a junction-object value; NULL when the value is not such an object.
     *
     * ponytail: legacy bare-int link rows (pre junction objects) yield NULL and never match;
     * the normalizer rewrites them on save, so add a scalar fallback only if such rows reappear.
     */
    private function valueRelatedItemIdSql(): string
    {
        return match (DB::getDriverName()) {
            'pgsql' => "(value ->> 'related_item_id')::bigint",
            'mysql', 'mariadb' => "CAST(JSON_VALUE(value, '$.related_item_id') AS UNSIGNED)",
            default => "json_extract(value, '$.related_item_id')",
        };
    }

    /**
     * Push role/admin item_filter into SQL before paginate/count.
     *
     * Accepts normalized shapes:
     * - `{ logic: "and", rules: [...] }`
     * - `{ _or: [ { logic, rules }, ... ] }` for multi-role OR merges
     *
     * @param  Builder<CollectionItem>  $query
     * @param  array<string, mixed>|null  $itemFilter
     */
    public function applyPermissionItemFilter(
        Builder $query,
        Collection $collection,
        ?array $itemFilter,
        ?string $locale = null,
    ): Builder {
        if ($itemFilter === null) {
            return $query;
        }

        $locale ??= $this->localeResolver->resolve();

        if (isset($itemFilter['_or']) && is_array($itemFilter['_or'])) {
            $orGroups = [];
            foreach ($itemFilter['_or'] as $candidate) {
                if (! is_array($candidate)) {
                    continue;
                }
                $dialect = $this->permissionRulesToDialect($candidate['rules'] ?? []);
                if ($dialect === []) {
                    // Empty rules = match-all for that role → unrestricted OR wins
                    return $query;
                }
                $orGroups[] = $dialect;
            }

            if ($orGroups === []) {
                return $query;
            }

            if (count($orGroups) === 1) {
                return $this->applyFilters($query, $collection, $orGroups[0], $locale);
            }

            $query->where(function (Builder $outer) use ($orGroups, $collection, $locale): void {
                foreach ($orGroups as $index => $dialect) {
                    $method = $index === 0 ? 'where' : 'orWhere';
                    $outer->{$method}(function (Builder $inner) use ($dialect, $collection, $locale): void {
                        $this->applyFilters($inner, $collection, $dialect, $locale);
                    });
                }
            });

            return $query;
        }

        $dialect = $this->permissionRulesToDialect($itemFilter['rules'] ?? []);
        if ($dialect === []) {
            return $query;
        }

        return $this->applyFilters($query, $collection, $dialect, $locale);
    }

    /**
     * Map permission condition rules to the listing filter dialect.
     *
     * @param  list<mixed>  $rules
     * @return array<string, mixed>
     */
    public function permissionRulesToDialect(array $rules): array
    {
        $filters = [];

        foreach ($rules as $rule) {
            if (! is_array($rule)) {
                continue;
            }

            $field = $rule['field'] ?? null;
            if (! is_string($field) || $field === '') {
                continue;
            }

            $operator = (string) ($rule['operator'] ?? 'equals');
            $dialectOp = self::PERMISSION_OPERATOR_MAP[$operator] ?? null;
            if ($dialectOp === null) {
                continue;
            }

            if ($dialectOp === '_null' || $dialectOp === '_nnull') {
                $filters[$field] = [$dialectOp => true];
            } else {
                $filters[$field] = [$dialectOp => $rule['value'] ?? null];
            }
        }

        return $filters;
    }

    /**
     * Normalize a single field filter value into operator => operand map.
     *
     * @return array<string, mixed>
     */
    public function normalizeFieldFilter(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        if (! is_array($value)) {
            return ['_contains' => (string) $value];
        }

        $ops = [];
        $hasOperator = false;
        foreach ($value as $key => $operand) {
            if (is_string($key) && in_array($key, self::OPERATORS, true)) {
                $ops[$key] = $operand;
                $hasOperator = true;
            }
        }

        if ($hasOperator) {
            return $ops;
        }

        // Treat bare arrays as _in
        return ['_in' => array_values($value)];
    }

    /**
     * @param  Builder<CollectionItem>  $query
     */
    private function applyOperator(
        Builder $query,
        CollectionField $field,
        string $operator,
        mixed $operand,
        string $locale,
    ): void {
        if ($operator === '_null') {
            if (filter_var($operand, FILTER_VALIDATE_BOOLEAN) || $operand === '1' || $operand === 1) {
                $query->whereDoesntHave('fieldValues', function (Builder $sub) use ($field): void {
                    $sub->where('field_id', $field->id);
                });
            }

            return;
        }

        if ($operator === '_nnull') {
            if (filter_var($operand, FILTER_VALIDATE_BOOLEAN) || $operand === '1' || $operand === 1) {
                $query->whereHas('fieldValues', function (Builder $sub) use ($field): void {
                    $sub->where('field_id', $field->id);
                });
            }

            return;
        }

        $callback = function (Builder $sub) use ($field, $operator, $operand, $locale): void {
            $sub->where('field_id', $field->id)->where('position', 0);

            if ($field->translatable) {
                $sub->where('locale', $locale);
            } else {
                $sub->whereNull('locale');
            }

            match ($operator) {
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_eq' => $sub->whereRaw($this->valueTextSql().' = ?', [(string) $operand]),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_neq' => $sub->whereRaw($this->valueTextSql().' <> ?', [(string) $operand]),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_contains' => $sub->whereRaw($this->valueLikeSql().' LIKE ?', ['%'.mb_strtolower((string) $operand).'%']),
                '_in' => $this->applyIn($sub, $operand),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_gt' => $sub->whereRaw($this->valueNumericSql().' > ?', [(float) $operand]),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_gte' => $sub->whereRaw($this->valueNumericSql().' >= ?', [(float) $operand]),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_lt' => $sub->whereRaw($this->valueNumericSql().' < ?', [(float) $operand]),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                '_lte' => $sub->whereRaw($this->valueNumericSql().' <= ?', [(float) $operand]),
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                default => $sub->whereRaw($this->valueLikeSql().' LIKE ?', ['%'.mb_strtolower((string) $operand).'%']),
            };
        };

        if ($operator === '_neq') {
            $query->where(function (Builder $q) use ($callback, $field): void {
                $q->whereDoesntHave('fieldValues', function (Builder $sub) use ($field): void {
                    $sub->where('field_id', $field->id);
                })->orWhereHas('fieldValues', $callback);
            });

            return;
        }

        $query->whereHas('fieldValues', $callback);
    }

    /**
     * @param  Builder<CollectionItemValue>  $sub
     */
    private function applyIn(Builder $sub, mixed $operand): void
    {
        $values = is_array($operand)
            ? array_map('strval', $operand)
            : array_values(array_filter(array_map('trim', explode(',', (string) $operand)), fn ($v) => $v !== ''));

        if ($values === []) {
            // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
            $sub->whereRaw('1 = 0');

            return;
        }

        $placeholders = implode(',', array_fill(0, count($values), '?'));
        // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
        $sub->whereRaw($this->valueTextSql().' IN ('.$placeholders.')', $values);
    }

    /**
     * Restrict items whose date/datetime field value falls in [from, to] (inclusive days).
     *
     * Uses text compare so ISO date / datetime-local prefixes sort correctly
     * (numeric cast would break "2026-10-11").
     *
     * @param  Builder<CollectionItem>  $query
     */
    public function applyDateFieldRange(
        Builder $query,
        CollectionField $field,
        string $fromDate,
        string $toDate,
        ?string $locale = null,
    ): Builder {
        $locale ??= $this->localeResolver->resolve();
        $from = substr($fromDate, 0, 10);
        $to = substr($toDate, 0, 10);

        // Exclusive upper bound: day after `to` so datetime values on that day stay in range.
        $exclusiveEnd = Carbon::createFromFormat('Y-m-d', $to)
            ?->startOfDay()
            ->addDay()
            ->format('Y-m-d');

        if ($exclusiveEnd === null) {
            return $query;
        }

        $textSql = $this->valueTextSql();

        $query->whereHas('fieldValues', function (Builder $sub) use ($field, $locale, $textSql, $from, $exclusiveEnd): void {
            $sub->where('field_id', $field->id)->where('position', 0);

            if ($field->translatable) {
                $sub->where('locale', $locale);
            } else {
                $sub->whereNull('locale');
            }

            // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
            $sub->whereRaw($textSql.' >= ?', [$from])
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                ->whereRaw($textSql.' < ?', [$exclusiveEnd]);
        });

        return $query;
    }

    /**
     * Apply listing sort. Supports system columns and simple scalar field names
     * (not nested `parent.child` paths). Defaults to latest id.
     *
     * @param  Builder<CollectionItem>  $query
     * @return array{sort: string, direction: string}
     */
    public function applySort(
        Builder $query,
        Collection $collection,
        ?string $sort,
        ?string $direction,
        ?string $locale = null,
    ): array {
        $direction = ($direction ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $sort = is_string($sort) ? trim($sort) : '';
        $locale ??= $this->localeResolver->resolve();

        if ($sort !== '' && in_array($sort, self::SYSTEM_SORT_COLUMNS, true)) {
            if ($sort === 'board_sort') {
                // Nulls last so untouched cards stay below manually ordered ones.
                // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                $query->orderByRaw('board_sort is null asc')
                    ->orderBy('board_sort', $direction)
                    ->orderByDesc('id');
            } else {
                $query->orderBy($sort, $direction);
            }

            return ['sort' => $sort, 'direction' => $direction];
        }

        if ($sort !== '' && ! str_contains($sort, '.')) {
            $collection->loadMissing('fields');
            $field = $collection->fields->firstWhere('name', $sort);
            if ($field instanceof CollectionField && $this->isSortableField($field)) {
                $valueSql = $this->valueOrderSql();
                $sub = CollectionItemValue::query()
                    // raw-sql: reviewed — item filters/sort; operands bound; SQL fragments from driver helpers only
                    ->selectRaw($valueSql)
                    ->whereColumn('collections_items_values.item_id', 'collections_items.id')
                    ->where('field_id', $field->id)
                    ->where('position', 0)
                    ->limit(1);

                if ($field->translatable) {
                    $sub->where('locale', $locale);
                } else {
                    $sub->whereNull('locale');
                }

                $query->orderBy($sub, $direction)->orderBy('id', 'desc');

                return ['sort' => $sort, 'direction' => $direction];
            }
        }

        $query->latest('id');

        return ['sort' => 'id', 'direction' => 'desc'];
    }

    /**
     * Public CMS API multi-key sort. Empty keys → latest(id). Always ends with id tiebreaker.
     * Nulls sort last in both directions.
     *
     * @param  Builder<CollectionItem>  $query
     * @param  list<array{name: string, direction: 'asc'|'desc', field: ?CollectionField}>  $keys
     */
    public function applyPublicSort(
        Builder $query,
        Collection $collection,
        array $keys,
        ?string $locale = null,
    ): void {
        if ($keys === []) {
            $query->latest('id');

            return;
        }

        $locale ??= $this->localeResolver->resolve();

        foreach ($keys as $key) {
            $direction = $key['direction'] === 'asc' ? 'asc' : 'desc';
            $field = $key['field'];

            if ($field instanceof CollectionField) {
                $valueSql = $this->publicValueOrderSql($field);
                $sub = CollectionItemValue::query()
                    // raw-sql: reviewed — public sort; field id/locale bound; SQL from driver helpers
                    ->selectRaw($valueSql)
                    ->whereColumn('collections_items_values.item_id', 'collections_items.id')
                    ->where('field_id', $field->id)
                    ->where('position', 0)
                    ->limit(1);

                if ($field->translatable) {
                    $sub->where('locale', $locale);
                } else {
                    $sub->whereNull('locale');
                }

                // Nulls last: missing translation / empty value after the keyed rows.
                // raw-sql: reviewed — subquery bindings rebound via orderBy
                $query->orderByRaw('('.$sub->toSql().') is null asc', $sub->getBindings())
                    ->orderBy($sub, $direction);

                continue;
            }

            $column = $key['name'];
            // raw-sql: reviewed — column from allowlist only (PublicItemSortParser::SYSTEM_COLUMNS)
            $query->orderByRaw($column.' is null asc')
                ->orderBy($column, $direction);
        }

        $query->orderByDesc('id');
    }

    /**
     * Whether a collection field may be used as a Public API sort key.
     */
    public function isPubliclySortableField(CollectionField $field): bool
    {
        return $this->isSortableField($field);
    }

    private function isSortableField(CollectionField $field): bool
    {
        $type = $field->type;

        if ($type->isArrayStorage() || $type->isRelationType()) {
            return false;
        }

        return ! in_array($type, [
            FieldTypeEnum::Image,
            FieldTypeEnum::Files,
            FieldTypeEnum::Map,
            FieldTypeEnum::M2a,
            FieldTypeEnum::Wysiwyg,
            FieldTypeEnum::Markdown,
            FieldTypeEnum::Code,
        ], true);
    }

    private function publicValueOrderSql(CollectionField $field): string
    {
        $type = $field->type instanceof FieldTypeEnum
            ? $field->type
            : FieldTypeEnum::tryFrom((string) $field->type);

        if (in_array($type, [FieldTypeEnum::Number, FieldTypeEnum::Slider], true)) {
            return $this->valueNumericSql();
        }

        return $this->valueTextSql();
    }

    private function valueLikeSql(): string
    {
        return 'LOWER('.$this->valueTextSql().')';
    }

    private function valueTextSql(): string
    {
        // jsonb/json scalars cast to text with surrounding quotes — unwrap for comparisons
        return match (DB::getDriverName()) {
            'pgsql' => "(value #>> '{}')",
            'sqlite' => "json_extract(value, '$')",
            'mysql', 'mariadb' => 'JSON_UNQUOTE(value)',
            default => 'CAST(value AS TEXT)',
        };
    }

    private function valueNumericSql(): string
    {
        return match (DB::getDriverName()) {
            'pgsql' => "(NULLIF({$this->valueTextSql()}, ''))::numeric",
            'mysql', 'mariadb' => 'CAST('.$this->valueTextSql().' AS DECIMAL(65,10))',
            default => 'CAST('.$this->valueTextSql().' AS REAL)',
        };
    }

    private function valueOrderSql(): string
    {
        return $this->valueTextSql();
    }
}
