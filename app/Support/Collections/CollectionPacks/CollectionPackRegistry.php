<?php

namespace App\Support\Collections\CollectionPacks;

/**
 * Source of truth for deterministic collection starter packs.
 *
 * To add a pack: create a *CollectionPack class and register it in all().
 */
final class CollectionPackRegistry
{
    /**
     * @return list<array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     collection: array{name: string, slug: string, is_singleton: bool},
     *     fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>,
     *     requires: list<string>,
     *     relations: list<array{field_name: string, type: string, related_pack?: string, related_slug?: string, display_field?: string}>
     * }>
     */
    public static function all(): array
    {
        return [
            SeoCollectionPack::definition(),
            CategoriesCollectionPack::definition(),
            PagesCollectionPack::definition(),
            ArticlesCollectionPack::definition(),
            ProductsCollectionPack::definition(),
        ];
    }

    /**
     * @return array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     collection: array{name: string, slug: string, is_singleton: bool},
     *     fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>,
     *     requires: list<string>,
     *     relations: list<array{field_name: string, type: string, related_pack?: string, related_slug?: string, display_field?: string}>
     * }|null
     */
    public static function find(string $key): ?array
    {
        foreach (self::all() as $pack) {
            if ($pack['key'] === $key) {
                return $pack;
            }
        }

        return null;
    }

    /**
     * Inertia / AI summary (no full settings payloads).
     *
     * @return list<array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     collection: array{name: string, slug: string, is_singleton: bool},
     *     requires: list<string>,
     *     fields: list<array{name: string, type: string, translatable: bool}>,
     *     relations: list<array{field_name: string, type: string, related_pack?: string, related_slug?: string, display_field?: string}>
     * }>
     */
    public static function summaries(): array
    {
        return array_map(static function (array $pack): array {
            return [
                'key' => $pack['key'],
                'label' => $pack['label'],
                'description' => $pack['description'],
                'collection' => $pack['collection'],
                'requires' => $pack['requires'],
                'fields' => array_map(static fn (array $field): array => [
                    'name' => $field['name'],
                    'type' => $field['type'],
                    'translatable' => (bool) $field['translatable'],
                ], $pack['fields']),
                'relations' => $pack['relations'],
            ];
        }, self::all());
    }

    /**
     * @return list<string>
     */
    public static function keys(): array
    {
        return array_column(self::all(), 'key');
    }
}
