<?php

namespace App\Support\Collections\FieldPacks;

/**
 * Source of truth for deterministic collection field packs.
 *
 * To add a pack: create a *FieldPack class and register it in all().
 */
final class FieldPackRegistry
{
    /**
     * @return list<array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>
     * }>
     */
    public static function all(): array
    {
        return [
            SeoInlineFieldPack::definition(),
            PublishingFieldPack::definition(),
            ContactFieldPack::definition(),
            SocialFieldPack::definition(),
        ];
    }

    /**
     * @return array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>
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
     *     fields: list<array{name: string, type: string, translatable: bool}>
     * }>
     */
    public static function summaries(): array
    {
        return array_map(static function (array $pack): array {
            return [
                'key' => $pack['key'],
                'label' => $pack['label'],
                'description' => $pack['description'],
                'fields' => array_map(static fn (array $field): array => [
                    'name' => $field['name'],
                    'type' => $field['type'],
                    'translatable' => (bool) $field['translatable'],
                ], $pack['fields']),
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
