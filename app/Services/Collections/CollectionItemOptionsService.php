<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Support\Collections\ItemDataAccessor;
use App\Support\Collections\LocaleResolver;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class CollectionItemOptionsService
{
    public function __construct(
        private ItemDataAccessor $itemDataAccessor,
    ) {}

    /**
     * @return LengthAwarePaginator<int, array{id: int, label: string}>
     */
    public function paginateForField(CollectionField $field, ?string $search = null, int $perPage = 20): LengthAwarePaginator
    {
        $relatedCollectionId = (int) data_get($field->settings, 'related_collection_id');
        $displayField = (string) (data_get($field->settings, 'display_field') ?: 'id');

        $query = CollectionItem::query()
            ->where('collection_id', $relatedCollectionId)
            ->latest('id');

        if ($search !== null && $search !== '') {
            $pattern = '%'.mb_strtolower($search).'%';
            $query->whereHas('fieldValues', function ($sub) use ($pattern): void {
                $sub->whereRaw('LOWER(CAST(value AS CHAR)) LIKE ?', [$pattern]);
            });
        }

        /** @var LengthAwarePaginator<int, CollectionItem> $paginator */
        $paginator = $query->paginate($perPage);

        return $paginator->through(function (CollectionItem $item) use ($displayField): array {
            $label = $this->resolveLabel($item, $displayField);

            return [
                'id' => $item->id,
                'label' => $label,
            ];
        });
    }

    private function resolveLabel(CollectionItem $item, string $displayField): string
    {
        if ($displayField === 'id') {
            return '#'.$item->id;
        }

        $data = $this->itemDataAccessor->flattenForLocale(
            $item,
            app(LocaleResolver::class)->resolve(),
            false,
        );

        $value = $data[$displayField] ?? null;

        if (is_scalar($value) && $value !== '') {
            return (string) $value;
        }

        return '#'.$item->id;
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
