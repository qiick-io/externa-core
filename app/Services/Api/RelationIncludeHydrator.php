<?php

namespace App\Services\Api;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Support\Api\ApiAccess;
use App\Support\Api\PublicApiIncludeParser;
use App\Support\Collections\CollectionItemDataAccessor;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Collection as SupportCollection;

/**
 * Depth-1 relation hydration for Public REST `?include=` field names.
 *
 * Nested items never re-apply relation includes; optional nested files/users follow the same include list.
 * List endpoints call {@see prewarm()} once so shared related ids load in a constant query count.
 */
class RelationIncludeHydrator
{
    public const PREWARM_ATTR = 'api.relation_include_prewarm';

    public const SERIALIZED_CACHE_ATTR = 'api.relation_include_serialized';

    public function __construct(
        private CollectionItemDataAccessor $itemDataAccessor,
        private CollectionLocaleResolver $localeResolver,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private FileFieldExpander $fileFieldExpander,
        private PublicApiIncludeParser $includeParser,
    ) {}

    /**
     * Batch-load related items for every parent in a list response (call once before mapping resources).
     *
     * @param  iterable<int, CollectionItem>  $items
     * @param  list<string>  $include
     */
    public function prewarm(iterable $items, Collection $collection, array $include, Request $request): void
    {
        $collection->loadMissing('fields');
        $relationFields = $this->relationFieldsForInclude($collection, $include, requirePresentInData: false);
        if ($relationFields === []) {
            return;
        }

        $locale = $this->resolveLocale($request);
        $includeAll = $request->boolean('include_all_translations');
        $idsByCollection = [];

        foreach ($items as $item) {
            if (! $item instanceof CollectionItem) {
                continue;
            }
            $item->loadMissing('fieldValues');
            $data = $this->itemDataAccessor->flattenForLocale($item, $locale, $includeAll);
            $idsByCollection = $this->mergeIdsByCollection(
                $idsByCollection,
                $this->collectRelatedIds($data, $relationFields),
            );
        }

        $request->attributes->set(self::PREWARM_ATTR, $this->batchLoadItems($idsByCollection, $request));
        $request->attributes->set(self::SERIALIZED_CACHE_ATTR, []);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<string>  $include
     * @return array<string, mixed>
     */
    public function hydrate(array $data, Collection $collection, array $include, Request $request): array
    {
        $collection->loadMissing('fields');

        $relationFields = $this->relationFieldsForInclude($collection, $include, requirePresentInData: true, data: $data);

        if ($relationFields === []) {
            return $data;
        }

        $idsByCollection = $this->collectRelatedIds($data, $relationFields);
        $itemsById = $this->batchLoadItems($idsByCollection, $request);

        $wantsFiles = $this->includeParser->has($include, PublicApiIncludeParser::TOKEN_FILES);
        $wantsUsers = $this->includeParser->has($include, PublicApiIncludeParser::TOKEN_USERS);
        $access = $this->resolveAccess($request);
        $locale = $this->resolveLocale($request);
        $includeAll = $request->boolean('include_all_translations');

        /** @var array<string, array<string, mixed>> $serializedCache */
        $serializedCache = $request->attributes->get(self::SERIALIZED_CACHE_ATTR, []);
        if (! is_array($serializedCache)) {
            $serializedCache = [];
        }

        foreach ($relationFields as $name => $meta) {
            /** @var CollectionField $field */
            $field = $meta['field'];
            /** @var FieldTypeEnum $type */
            $type = $meta['type'];
            $data[$name] = $this->hydrateFieldValue(
                $data[$name],
                $type,
                $itemsById,
                $serializedCache,
                $request,
                $access,
                $locale,
                $includeAll,
                $wantsFiles,
                $wantsUsers,
            );
        }

        $request->attributes->set(self::SERIALIZED_CACHE_ATTR, $serializedCache);

        return $data;
    }

    /**
     * @param  array<string, mixed>|null  $data
     * @param  list<string>  $include
     * @return array<string, array{field: CollectionField, type: FieldTypeEnum}>
     */
    private function relationFieldsForInclude(
        Collection $collection,
        array $include,
        bool $requirePresentInData,
        ?array $data = null,
    ): array {
        $relationFields = [];
        foreach ($collection->fields as $field) {
            if (! $this->includeParser->has($include, $field->name)) {
                continue;
            }
            $type = $this->fieldType($field);
            if ($type === null || ! $this->isHydratableRelation($type)) {
                continue;
            }
            if ($requirePresentInData && ($data === null || ! array_key_exists($field->name, $data))) {
                continue;
            }
            $relationFields[$field->name] = ['field' => $field, 'type' => $type];
        }

        return $relationFields;
    }

    /**
     * @param  array<int, array<int, true>>  $into
     * @param  array<int, array<int, true>>  $from
     * @return array<int, array<int, true>>
     */
    private function mergeIdsByCollection(array $into, array $from): array
    {
        foreach ($from as $collectionId => $idMap) {
            foreach ($idMap as $itemId => $_) {
                $into[$collectionId][$itemId] = true;
            }
        }

        return $into;
    }

    /**
     * @param  array<string, array{field: CollectionField, type: FieldTypeEnum}>  $relationFields
     * @param  array<string, mixed>  $data
     * @return array<int, array<int, true>> collection_id => [item_id => true]
     */
    private function collectRelatedIds(array $data, array $relationFields): array
    {
        $idsByCollection = [];

        foreach ($relationFields as $name => $meta) {
            $field = $meta['field'];
            $type = $meta['type'];
            $raw = $data[$name] ?? null;

            if ($type === FieldTypeEnum::M2a) {
                foreach ($this->m2aEntries($raw) as $entry) {
                    $idsByCollection[$entry['related_collection_id']][$entry['related_item_id']] = true;
                }

                continue;
            }

            $relatedCollectionId = (int) data_get($field->settings, 'related_collection_id');
            if ($relatedCollectionId <= 0) {
                continue;
            }

            foreach ($this->extractItemIds($raw, $type) as $itemId) {
                $idsByCollection[$relatedCollectionId][$itemId] = true;
            }
        }

        return $idsByCollection;
    }

    /**
     * @param  array<int, array<int, true>>  $idsByCollection
     * @return SupportCollection<int, CollectionItem>
     */
    private function batchLoadItems(array $idsByCollection, Request $request): SupportCollection
    {
        /** @var SupportCollection<int, CollectionItem>|null $prewarmed */
        $prewarmed = $request->attributes->get(self::PREWARM_ATTR);
        $itemsById = $prewarmed instanceof SupportCollection ? $prewarmed->all() : [];

        foreach ($idsByCollection as $collectionId => $idMap) {
            $missing = [];
            foreach (array_keys($idMap) as $id) {
                if (! isset($itemsById[$id])) {
                    $missing[] = $id;
                }
            }
            if ($missing === []) {
                continue;
            }

            $loaded = CollectionItem::query()
                ->where('collection_id', $collectionId)
                ->whereIn('id', $missing)
                ->with([
                    'fieldValues',
                    'userCreated:id,first_name,last_name,email',
                    'userUpdated:id,first_name,last_name,email',
                    'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
                ])
                ->get();

            foreach ($loaded as $item) {
                $itemsById[$item->id] = $item;
            }
        }

        $result = collect($itemsById);
        $request->attributes->set(self::PREWARM_ATTR, $result);

        return $result;
    }

    /**
     * @param  SupportCollection<int, CollectionItem>  $itemsById
     * @param  array<int, array<string, mixed>>  $serializedCache
     */
    private function hydrateFieldValue(
        mixed $raw,
        FieldTypeEnum $type,
        SupportCollection $itemsById,
        array &$serializedCache,
        Request $request,
        ?ApiAccess $access,
        string $locale,
        bool $includeAll,
        bool $wantsFiles,
        bool $wantsUsers,
    ): mixed {
        if ($type === FieldTypeEnum::M2a) {
            if (! is_array($raw)) {
                return $raw;
            }

            $out = [];
            foreach ($this->m2aEntries($raw) as $entry) {
                $item = $itemsById->get($entry['related_item_id']);
                $relatedCollection = $item?->collection;
                if (
                    ! $item instanceof CollectionItem
                    || ! $relatedCollection instanceof Collection
                    || ! $this->permissionEnforcer->isItemReadable($request, $relatedCollection, $item)
                ) {
                    $out[] = [
                        'related_collection_id' => $entry['related_collection_id'],
                        'related_item_id' => $entry['related_item_id'],
                    ];

                    continue;
                }

                $out[] = [
                    'related_collection_id' => $entry['related_collection_id'],
                    'related_item_id' => $entry['related_item_id'],
                    'item' => $this->serializeNested(
                        $item,
                        $serializedCache,
                        $request,
                        $access,
                        $locale,
                        $includeAll,
                        $wantsFiles,
                        $wantsUsers,
                    ),
                ];
            }

            return $out;
        }

        if ($type->isMultipleRelationType()) {
            if (! is_array($raw)) {
                return $raw;
            }

            $out = [];
            foreach ($raw as $entry) {
                $link = $this->normalizeM2mEntry($entry);
                if ($link === null) {
                    continue;
                }

                $item = $itemsById->get($link['related_item_id']);
                $relatedCollection = $item?->collection;
                if (
                    ! $item instanceof CollectionItem
                    || ! $relatedCollection instanceof Collection
                    || ! $this->permissionEnforcer->isItemReadable($request, $relatedCollection, $item)
                ) {
                    $out[] = $link;

                    continue;
                }

                $out[] = [
                    'item' => $this->serializeNested(
                        $item,
                        $serializedCache,
                        $request,
                        $access,
                        $locale,
                        $includeAll,
                        $wantsFiles,
                        $wantsUsers,
                    ),
                    'meta' => $link['meta'],
                ];
            }

            return $out;
        }

        // M2O — scalar id
        $id = $this->normalizeId($raw);
        if ($id === null) {
            return $raw;
        }

        $item = $itemsById->get($id);
        $relatedCollection = $item?->collection;
        if (
            ! $item instanceof CollectionItem
            || ! $relatedCollection instanceof Collection
            || ! $this->permissionEnforcer->isItemReadable($request, $relatedCollection, $item)
        ) {
            return $id;
        }

        return $this->serializeNested(
            $item,
            $serializedCache,
            $request,
            $access,
            $locale,
            $includeAll,
            $wantsFiles,
            $wantsUsers,
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $serializedCache
     * @return array<string, mixed>
     */
    private function serializeNested(
        CollectionItem $item,
        array &$serializedCache,
        Request $request,
        ?ApiAccess $access,
        string $locale,
        bool $includeAll,
        bool $wantsFiles,
        bool $wantsUsers,
    ): array {
        $cacheKey = $item->id.'|'.($wantsFiles ? 'f' : '').($wantsUsers ? 'u' : '').'|'.$locale.'|'.($includeAll ? '1' : '0');
        if (isset($serializedCache[$cacheKey])) {
            return $serializedCache[$cacheKey];
        }

        $item->loadMissing('collection.fields');
        $data = $this->itemDataAccessor->flattenForLocale($item, $locale, $includeAll);

        if ($wantsFiles && $item->collection !== null) {
            $data = $this->fileFieldExpander->expand($data, $item->collection, $access);
        }

        if ($item->collection !== null) {
            $data = $this->permissionEnforcer->stripData($request, $item->collection, $data);
        }

        $payload = [
            'id' => $item->id,
            'collection_id' => $item->collection_id,
            'data' => $data,
            'created_at' => $item->created_at?->toIso8601String(),
            'updated_at' => $item->updated_at?->toIso8601String(),
            'user_created_id' => $item->user_created_id,
            'user_updated_id' => $item->user_updated_id,
            'user_created' => $wantsUsers ? $this->miniUser($item->userCreated) : null,
            'user_updated' => $wantsUsers ? $this->miniUser($item->userUpdated) : null,
        ];

        $serializedCache[$cacheKey] = $payload;

        return $payload;
    }

    /**
     * @return list<int>
     */
    private function extractItemIds(mixed $raw, FieldTypeEnum $type): array
    {
        if ($type->isMultipleRelationType()) {
            if (! is_array($raw)) {
                return [];
            }
            $ids = [];
            foreach ($raw as $entry) {
                $link = $this->normalizeM2mEntry($entry);
                if ($link !== null) {
                    $ids[] = $link['related_item_id'];
                }
            }

            return array_values(array_unique($ids));
        }

        $id = $this->normalizeId($raw);

        return $id === null ? [] : [$id];
    }

    /**
     * @return list<array{related_collection_id: int, related_item_id: int}>
     */
    private function m2aEntries(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $out = [];
        foreach ($raw as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $collectionId = $entry['related_collection_id'] ?? null;
            $itemId = $entry['related_item_id'] ?? null;
            if (! is_numeric($collectionId) || ! is_numeric($itemId)) {
                continue;
            }
            $out[] = [
                'related_collection_id' => (int) $collectionId,
                'related_item_id' => (int) $itemId,
            ];
        }

        return $out;
    }

    /**
     * @return array{related_item_id: int, meta: array<string, mixed>}|null
     */
    private function normalizeM2mEntry(mixed $entry): ?array
    {
        if (is_numeric($entry)) {
            return [
                'related_item_id' => (int) $entry,
                'meta' => [],
            ];
        }

        if (! is_array($entry)) {
            return null;
        }

        $id = $entry['related_item_id'] ?? $entry['id'] ?? null;
        if (! is_numeric($id)) {
            return null;
        }

        $meta = $entry['meta'] ?? [];

        return [
            'related_item_id' => (int) $id,
            'meta' => is_array($meta) ? $meta : [],
        ];
    }

    private function normalizeId(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value > 0 ? $value : null;
        }
        if (is_string($value) && ctype_digit($value)) {
            $id = (int) $value;

            return $id > 0 ? $id : null;
        }
        if (is_array($value) && isset($value['related_item_id']) && is_numeric($value['related_item_id'])) {
            $id = (int) $value['related_item_id'];

            return $id > 0 ? $id : null;
        }

        return null;
    }

    private function isHydratableRelation(FieldTypeEnum $type): bool
    {
        return $type->isRelationType() || $type === FieldTypeEnum::M2a;
    }

    private function fieldType(CollectionField $field): ?FieldTypeEnum
    {
        return $field->type instanceof FieldTypeEnum
            ? $field->type
            : FieldTypeEnum::tryFrom((string) $field->type);
    }

    private function resolveAccess(Request $request): ?ApiAccess
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            return $access;
        }

        try {
            return app(ApiAccess::class);
        } catch (\Throwable) {
            return null;
        }
    }

    private function resolveLocale(Request $request): string
    {
        $queryLocale = $request->query('locale');
        $override = is_string($queryLocale) && $queryLocale !== '' ? $queryLocale : null;
        $this->localeResolver->assertRequestedLocaleAllowed($override);

        return $this->localeResolver->resolve($override);
    }

    /**
     * @return array{id: int, name: string, email: string|null}|null
     */
    private function miniUser(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => (int) $user->id,
            'name' => $user->name !== '' ? $user->name : ($user->email ?? ('#'.$user->id)),
            'email' => $user->email,
        ];
    }
}
