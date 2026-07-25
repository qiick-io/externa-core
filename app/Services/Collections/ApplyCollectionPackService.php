<?php

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Support\Collections\CollectionPacks\CollectionPackRegistry;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Applies a registered collection pack (deps → collection → fields → relations).
 */
final class ApplyCollectionPackService
{
    public function __construct(
        private readonly PackFieldCreator $packFieldCreator,
    ) {}

    /**
     * @param  array{name?: string, slug?: string}  $overrides
     * @return array{
     *     pack: string,
     *     collection: array{id: int, name: string, slug: string, created: bool},
     *     created_fields: list<array{id: int, name: string, type: string, translatable: bool}>,
     *     skipped_fields: list<string>,
     *     created_relations: list<array{id: int, name: string, type: string, translatable: bool}>,
     *     skipped_relations: list<string>,
     *     dependencies: list<array{pack: string, collection_id: int, slug: string, created: bool}>
     * }
     */
    public function apply(string $packKey, array $overrides = []): array
    {
        $pack = CollectionPackRegistry::find($packKey);

        if ($pack === null) {
            throw new InvalidArgumentException('Unknown collection pack: '.$packKey);
        }

        return DB::transaction(function () use ($pack, $overrides): array {
            $dependencies = [];
            $resolvedByPack = [];

            foreach ($pack['requires'] as $requiredKey) {
                $depResult = $this->apply($requiredKey);
                $dependencies[] = [
                    'pack' => $depResult['pack'],
                    'collection_id' => $depResult['collection']['id'],
                    'slug' => $depResult['collection']['slug'],
                    'created' => $depResult['collection']['created'],
                ];
                $resolvedByPack[$requiredKey] = Collection::query()->findOrFail($depResult['collection']['id']);
            }

            $defaultSlug = $pack['collection']['slug'];
            $slug = isset($overrides['slug']) && is_string($overrides['slug']) && trim($overrides['slug']) !== ''
                ? trim($overrides['slug'])
                : $defaultSlug;
            $name = isset($overrides['name']) && is_string($overrides['name']) && trim($overrides['name']) !== ''
                ? trim($overrides['name'])
                : $pack['collection']['name'];

            $existing = Collection::query()->where('slug', $slug)->first();
            $createdCollection = false;

            if ($existing instanceof Collection) {
                $collection = $existing;
            } else {
                $collection = Collection::query()->create([
                    'name' => $name,
                    'slug' => $slug,
                    'is_singleton' => (bool) ($pack['collection']['is_singleton'] ?? false),
                ]);
                $createdCollection = true;

                if ($collection->is_singleton) {
                    $collection->items()->create([]);
                }
            }

            $fieldsResult = $this->packFieldCreator->createFromDefinitions($collection, $pack['fields']);

            $relationDefs = [];
            foreach ($pack['relations'] as $relation) {
                $relatedCollection = $this->resolveRelatedCollection($relation, $resolvedByPack);
                $relationDefs[] = [
                    'name' => $relation['field_name'],
                    'type' => $relation['type'] ?? FieldTypeEnum::ManyToOne->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => ucfirst(str_replace('_', ' ', $relation['field_name']))],
                        'related_collection_id' => $relatedCollection->id,
                        'display_field' => $relation['display_field'] ?? 'title',
                    ],
                ];
            }

            $relationsResult = $this->packFieldCreator->createFromDefinitions($collection, $relationDefs);

            return [
                'pack' => $pack['key'],
                'collection' => [
                    'id' => $collection->id,
                    'name' => $collection->name,
                    'slug' => $collection->slug,
                    'created' => $createdCollection,
                ],
                'created_fields' => $fieldsResult['created'],
                'skipped_fields' => $fieldsResult['skipped'],
                'created_relations' => $relationsResult['created'],
                'skipped_relations' => $relationsResult['skipped'],
                'dependencies' => $dependencies,
            ];
        });
    }

    /**
     * @param  array{field_name: string, type: string, related_pack?: string, related_slug?: string, display_field?: string}  $relation
     * @param  array<string, Collection>  $resolvedByPack
     */
    private function resolveRelatedCollection(array $relation, array $resolvedByPack): Collection
    {
        if (isset($relation['related_pack'])) {
            $packKey = $relation['related_pack'];
            if (isset($resolvedByPack[$packKey])) {
                return $resolvedByPack[$packKey];
            }

            $relatedPack = CollectionPackRegistry::find($packKey);
            if ($relatedPack === null) {
                throw new InvalidArgumentException('Unknown related pack: '.$packKey);
            }

            $related = Collection::query()->where('slug', $relatedPack['collection']['slug'])->first();
            if ($related instanceof Collection) {
                return $related;
            }

            $depResult = $this->apply($packKey);

            return Collection::query()->findOrFail($depResult['collection']['id']);
        }

        $slug = $relation['related_slug'] ?? null;
        if (! is_string($slug) || $slug === '') {
            throw new InvalidArgumentException('Relation '.$relation['field_name'].' needs related_pack or related_slug.');
        }

        $related = Collection::query()->where('slug', $slug)->first();
        if ($related === null) {
            throw new InvalidArgumentException('Related collection slug not found: '.$slug);
        }

        return $related;
    }
}
