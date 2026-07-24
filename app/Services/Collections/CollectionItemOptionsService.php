<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Support\Collections\CollectionItemDataAccessor;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Paginated id/label options for relation fields and admin selects.
 */
class CollectionItemOptionsService
{
    public function __construct(
        private CollectionItemDataAccessor $itemDataAccessor,
    ) {}

    /**
     * @return LengthAwarePaginator<int, array{id: int, label: string}>
     */
    public function paginateForField(
        CollectionField $field,
        ?string $search = null,
        int $perPage = 20,
        ?int $relatedCollectionIdOverride = null,
        ?string $displayFieldOverride = null,
    ): LengthAwarePaginator {
        $relatedCollectionId = $relatedCollectionIdOverride
            ?? (int) data_get($field->settings, 'related_collection_id');

        $relatedCollection = Collection::query()->find($relatedCollectionId);
        if ($relatedCollection === null) {
            return $this->emptyPaginator($perPage);
        }

        $displayField = $displayFieldOverride
            ?? (string) (data_get($field->settings, 'display_field') ?: 'id');
        if ($displayField === '') {
            $displayField = 'id';
        }
        $displayTemplate = data_get($field->settings, 'display_template');
        $filter = $this->normalizeRelationFilter(data_get($field->settings, 'filter'));

        return $this->paginateForCollection(
            $relatedCollection,
            $displayField,
            is_string($displayTemplate) ? $displayTemplate : null,
            $filter,
            $search,
            $perPage,
        );
    }

    /**
     * @param  array<string, scalar|null>  $filter
     * @return LengthAwarePaginator<int, array{id: int, label: string}>
     */
    public function paginateForCollection(
        Collection $relatedCollection,
        string $displayField = 'title',
        ?string $displayTemplate = null,
        array $filter = [],
        ?string $search = null,
        int $perPage = 20,
    ): LengthAwarePaginator {
        $query = CollectionItem::query()
            ->where('collection_id', $relatedCollection->id)
            ->latest('id');

        $this->applyRelationFilter($query, $relatedCollection, $filter);

        if ($search !== null && $search !== '') {
            $pattern = '%'.mb_strtolower($search).'%';
            $query->whereHas('fieldValues', function ($sub) use ($pattern): void {
                $sub->whereRaw($this->valueLikeSql().' LIKE ?', [$pattern]);
            });
        }

        /** @var LengthAwarePaginator<int, CollectionItem> $paginator */
        $paginator = $query->paginate($perPage);

        return $paginator->through(function (CollectionItem $item) use ($displayField, $displayTemplate): array {
            return [
                'id' => $item->id,
                'label' => $this->resolveLabel($item, $displayField, $displayTemplate),
            ];
        });
    }

    /**
     * @param  array<string, scalar|null>  $filter
     * @param  Builder<CollectionItem>  $query
     */
    private function applyRelationFilter(Builder $query, Collection $relatedCollection, array $filter): void
    {
        if ($filter === []) {
            return;
        }

        $relatedCollection->loadMissing('fields');
        $fieldsByName = $relatedCollection->fields->keyBy('name');

        foreach ($filter as $fieldName => $expectedValue) {
            if (! is_string($fieldName) || $expectedValue === null || $expectedValue === '') {
                continue;
            }

            $field = $fieldsByName->get($fieldName);
            if (! $field instanceof CollectionField) {
                continue;
            }

            $query->whereHas('fieldValues', function ($sub) use ($field, $expectedValue): void {
                $sub->where('field_id', $field->id)
                    ->whereNull('locale')
                    ->where('position', 0)
                    ->whereRaw($this->jsonScalarEqualsSql().' = ?', [(string) $expectedValue]);
            });
        }
    }

    /**
     * Resolve a human-readable label for a related collection item.
     */
    public function resolveLabel(CollectionItem $item, string $displayField, ?string $displayTemplate): string
    {
        $data = $this->itemDataAccessor->flattenForLocale(
            $item,
            app(CollectionLocaleResolver::class)->resolve(),
            false,
        );

        if (is_string($displayTemplate) && trim($displayTemplate) !== '') {
            $label = preg_replace_callback(
                '/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/',
                static function (array $matches) use ($data): string {
                    $fieldName = $matches[1];
                    $value = $data[$fieldName] ?? null;

                    if (is_scalar($value) && $value !== '') {
                        return (string) $value;
                    }

                    return '';
                },
                $displayTemplate,
            );

            $label = trim(preg_replace('/\s+/', ' ', (string) $label) ?? '');

            if ($label !== '') {
                return $label;
            }
        }

        if ($displayField === 'id') {
            return '#'.$item->id;
        }

        $value = $data[$displayField] ?? null;

        if (is_scalar($value) && $value !== '') {
            return (string) $value;
        }

        return '#'.$item->id;
    }

    /**
     * @return array<string, scalar|null>
     */
    private function normalizeRelationFilter(mixed $filter): array
    {
        if (! is_array($filter)) {
            return [];
        }

        $out = [];
        foreach ($filter as $fieldName => $expectedValue) {
            if (! is_string($fieldName) || ! is_scalar($expectedValue)) {
                continue;
            }

            $out[$fieldName] = $expectedValue;
        }

        return $out;
    }

    private function valueLikeSql(): string
    {
        return match (DB::getDriverName()) {
            'pgsql' => 'LOWER(value::text)',
            default => 'LOWER(CAST(value AS TEXT))',
        };
    }

    private function jsonScalarEqualsSql(): string
    {
        return match (DB::getDriverName()) {
            'pgsql' => "value #>> '{}'",
            'sqlite' => "json_extract(value, '$')",
            default => 'JSON_UNQUOTE(value)',
        };
    }

    /**
     * @return LengthAwarePaginator<int, array{id: int, label: string}>
     */
    private function emptyPaginator(int $perPage): LengthAwarePaginator
    {
        return CollectionItem::query()
            ->whereRaw('1 = 0')
            ->paginate($perPage)
            ->through(fn (CollectionItem $item): array => [
                'id' => $item->id,
                'label' => '#'.$item->id,
            ]);
    }

    /**
     * @return list<array{id: int, name: string, slug: string}>
     */
    public function collectionsForSelect(): array
    {
        return Collection::query()
            ->ordered()
            ->get(['id', 'name', 'slug'])
            ->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
            ])
            ->all();
    }
}
