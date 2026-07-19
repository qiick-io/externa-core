<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Applies field-based filters to collection item listing queries.
 */
class CollectionItemQueryService
{
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

    private function valueLikeSql(): string
    {
        return match (DB::getDriverName()) {
            'pgsql' => 'LOWER(value::text)',
            default => 'LOWER(CAST(value AS TEXT))',
        };
    }
}
