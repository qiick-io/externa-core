<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Support\Collections\CollectionLocaleResolver;
use App\Support\Validation\FilterQueryLimits;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Applies field-based filters and sort to collection item listing queries.
 *
 * Filter dialect (query string or GraphQL JSON):
 * - `filter[title]=foo` → contains (LIKE) — backward compatible
 * - `filter[title][_eq]=foo`, `_neq`, `_contains`, `_null=1`, `_nnull=1`
 * - `filter[count][_gte]=1`, `_lte`, `_gt`, `_lt`
 * - `filter[status][_in]=a,b,c` or array
 *
 * Permission item_filter operators (equals|not_equals|empty|not_empty) map onto this dialect.
 */
class CollectionItemQueryService
{
    /** @var list<string> */
    public const SYSTEM_SORT_COLUMNS = ['id', 'created_at', 'updated_at'];

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
        private CollectionLocaleResolver $localeResolver,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @param  Builder<CollectionItem>  $query
     */
    public function applyFilters(Builder $query, Collection $collection, array $filters, ?string $locale = null): Builder
    {
        $filters = FilterQueryLimits::assertValid($filters);

        $collection->loadMissing('fields');
        $fieldsByName = $collection->fields->keyBy('name');
        $locale ??= $this->localeResolver->resolve();

        foreach ($filters as $fieldName => $value) {
            if (! is_string($fieldName) || $fieldName === '') {
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
                '_eq' => $sub->whereRaw($this->valueTextSql().' = ?', [(string) $operand]),
                '_neq' => $sub->whereRaw($this->valueTextSql().' <> ?', [(string) $operand]),
                '_contains' => $sub->whereRaw($this->valueLikeSql().' LIKE ?', ['%'.mb_strtolower((string) $operand).'%']),
                '_in' => $this->applyIn($sub, $operand),
                '_gt' => $sub->whereRaw($this->valueNumericSql().' > ?', [(float) $operand]),
                '_gte' => $sub->whereRaw($this->valueNumericSql().' >= ?', [(float) $operand]),
                '_lt' => $sub->whereRaw($this->valueNumericSql().' < ?', [(float) $operand]),
                '_lte' => $sub->whereRaw($this->valueNumericSql().' <= ?', [(float) $operand]),
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
            $sub->whereRaw('1 = 0');

            return;
        }

        $placeholders = implode(',', array_fill(0, count($values), '?'));
        $sub->whereRaw($this->valueTextSql().' IN ('.$placeholders.')', $values);
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
            $query->orderBy($sort, $direction);

            return ['sort' => $sort, 'direction' => $direction];
        }

        if ($sort !== '' && ! str_contains($sort, '.')) {
            $collection->loadMissing('fields');
            $field = $collection->fields->firstWhere('name', $sort);
            if ($field instanceof CollectionField && $this->isSortableField($field)) {
                $valueSql = $this->valueOrderSql();
                $sub = CollectionItemValue::query()
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

    private function isSortableField(CollectionField $field): bool
    {
        $type = $field->type instanceof FieldTypeEnum
            ? $field->type
            : FieldTypeEnum::tryFrom((string) $field->type);

        if ($type === null) {
            return false;
        }

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
            default => 'CAST('.$this->valueTextSql().' AS REAL)',
        };
    }

    private function valueOrderSql(): string
    {
        return $this->valueTextSql();
    }
}
