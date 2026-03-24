<?php

namespace App\Services\Cms;

use App\Models\ContentCollection;
use App\Models\Field;
use App\Models\Item;
use App\Support\Cms\LocaleResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ItemQueryService
{
    public function __construct(
        private LocaleResolver $localeResolver,
    ) {}

    /**
     * @param  array<string, string>  $filters
     * @param  Builder<Item>  $query
     */
    public function applyFilters(Builder $query, ContentCollection $collection, array $filters, ?string $locale = null): Builder
    {
        $collection->loadMissing('fields');
        $fieldsByName = $collection->fields->keyBy('name');
        $locale ??= $this->localeResolver->resolve();

        foreach ($filters as $fieldName => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            $field = $fieldsByName->get($fieldName);
            if (! $field instanceof Field) {
                continue;
            }

            $pattern = '%'.mb_strtolower((string) $value).'%';

            if ($field->translatable) {
                $query->where(function (Builder $q) use ($field, $pattern, $locale): void {
                    $first = true;
                    foreach ($this->localeResolver->fallbackChain($locale) as $tryLocale) {
                        if ($first) {
                            $this->applyJsonLike($q, $field->name, $tryLocale, $pattern, false);
                            $first = false;
                        } else {
                            $this->applyJsonLike($q, $field->name, $tryLocale, $pattern, true);
                        }
                    }
                });
            } else {
                $this->applyJsonLike($query, $field->name, null, $pattern, false);
            }
        }

        return $query;
    }

    /**
     * @param  Builder<Item>  $query
     */
    private function applyJsonLike(Builder $query, string $fieldName, ?string $locale, string $pattern, bool $or): void
    {
        $driver = DB::getDriverName();
        $name = str_replace("'", "''", $fieldName);

        if ($driver === 'pgsql') {
            if ($locale !== null) {
                $loc = str_replace("'", "''", $locale);
                $sql = "LOWER(CAST(data->'{$name}'->>'{$loc}' AS TEXT)) LIKE ?";
            } else {
                $sql = "LOWER(CAST(data->>'{$name}' AS TEXT)) LIKE ?";
            }
        } elseif ($driver === 'sqlite') {
            if ($locale !== null) {
                $loc = str_replace('"', '""', $locale);
                $n = str_replace('"', '""', $fieldName);
                $sql = "LOWER(CAST(json_extract(data, '$.\"{$n}\".\"{$loc}\"') AS TEXT)) LIKE ?";
            } else {
                $n = str_replace('"', '""', $fieldName);
                $sql = "LOWER(CAST(json_extract(data, '$.\"{$n}\"') AS TEXT)) LIKE ?";
            }
        } else {
            if ($locale !== null) {
                $column = 'data->'.$fieldName.'->'.$locale;
            } else {
                $column = 'data->'.$fieldName;
            }
            $sql = 'LOWER(CAST('.$query->getGrammar()->wrap($column).' AS TEXT)) LIKE ?';
        }

        if ($or) {
            $query->orWhereRaw($sql, [$pattern]);
        } else {
            $query->whereRaw($sql, [$pattern]);
        }
    }
}
