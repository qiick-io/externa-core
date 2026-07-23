<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Applies field-based filters and sort to collection item listing queries.
 */
class CollectionItemQueryService
{
    /** @var list<string> */
    public const SYSTEM_SORT_COLUMNS = ['id', 'created_at', 'updated_at'];

    public function __construct(
        private CollectionLocaleResolver $localeResolver,
    ) {}

    /**
     * @param  array<string, string>  $filters
     * @param  Builder<CollectionItem>  $query
     */
    public function applyFilters(Builder $query, Collection $collection, array $filters, ?string $locale = null): Builder
    {
        $collection->loadMissing('fields');
        $fieldsByName = $collection->fields->keyBy('name');
        $locale ??= $this->localeResolver->resolve();

        foreach ($filters as $fieldName => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            $field = $fieldsByName->get($fieldName);
            if (! $field instanceof CollectionField) {
                continue;
            }

            $pattern = '%'.mb_strtolower((string) $value).'%';

            if ($field->translatable) {
                $query->where(function (Builder $q) use ($field, $pattern, $locale): void {
                    $first = true;
                    foreach ($this->localeResolver->fallbackChain($locale) as $tryLocale) {
                        $callback = function (Builder $sub) use ($field, $pattern, $tryLocale): void {
                            $sub->where('field_id', $field->id)
                                ->where('locale', $tryLocale)
                                ->whereRaw($this->valueLikeSql().' LIKE ?', [$pattern]);
                        };
                        if ($first) {
                            $q->whereHas('fieldValues', $callback);
                            $first = false;
                        } else {
                            $q->orWhereHas('fieldValues', $callback);
                        }
                    }
                });
            } else {
                $query->whereHas('fieldValues', function (Builder $sub) use ($field, $pattern): void {
                    $sub->where('field_id', $field->id)
                        ->whereNull('locale')
                        ->where('position', 0)
                        ->whereRaw($this->valueLikeSql().' LIKE ?', [$pattern]);
                });
            }
        }

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
            FieldTypeEnum::File,
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
        return match (DB::getDriverName()) {
            'pgsql' => 'LOWER(value::text)',
            default => 'LOWER(CAST(value AS TEXT))',
        };
    }

    private function valueOrderSql(): string
    {
        return match (DB::getDriverName()) {
            'pgsql' => 'value::text',
            default => 'CAST(value AS TEXT)',
        };
    }
}
