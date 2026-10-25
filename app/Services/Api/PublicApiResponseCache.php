<?php

namespace App\Services\Api;

use Illuminate\Support\Facades\Cache;

/**
 * Versioned response cache for public REST/GraphQL reads.
 *
 * Freshness comes from synchronous collection version bumps on write;
 * TTL is only a safety net for orphaned payload keys.
 *
 * Global epoch is folded into the effective version so a Settings flush
 * invalidates every collection without enumerating payload keys.
 */
final class PublicApiResponseCache
{
    public const TTL_SECONDS = 120;

    private const VERSION_PREFIX = 'public.api.collver.';

    private const EPOCH_KEY = 'public.api.epoch';

    /** Local collection versions stay below this; epoch shifts the high digits. */
    private const EPOCH_STRIDE = 1_000_000;

    public function epoch(): int
    {
        return (int) Cache::get(self::EPOCH_KEY, 1);
    }

    /**
     * Effective version for cache keys (local bump or global flush).
     */
    public function version(int $collectionId): int
    {
        return ($this->epoch() * self::EPOCH_STRIDE) + $this->collectionVersion($collectionId);
    }

    /**
     * Bump collection cache version synchronously (call before write response).
     */
    public function bump(int $collectionId): void
    {
        $key = self::VERSION_PREFIX.$collectionId;
        Cache::forever($key, $this->collectionVersion($collectionId) + 1);
    }

    /**
     * Invalidate all public API response caches without leaving stale reads.
     */
    public function bumpAll(): void
    {
        Cache::forever(self::EPOCH_KEY, $this->epoch() + 1);
    }

    /**
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public function remember(string $key, callable $callback): mixed
    {
        return Cache::remember($key, self::TTL_SECONDS, $callback);
    }

    public function collectionKey(string $slug, int $version, string $surface = 'rest'): string
    {
        return $surface === 'rest'
            ? "public.api.v1.collection.{$slug}.v{$version}"
            : "public.api.{$surface}.collection.{$slug}.v{$version}";
    }

    public function itemsKey(string $slug, int $version, string $hash): string
    {
        return "public.api.v1.items.{$slug}.v{$version}.{$hash}";
    }

    public function itemKey(string $slug, int|string $id, int $version, string $hash): string
    {
        return "public.api.v1.item.{$slug}.{$id}.v{$version}.{$hash}";
    }

    /**
     * Stable md5 of factors that change the serialized JSON (filters, locale, role, …).
     *
     * @param  array<string, mixed>  $factors
     */
    public function hash(array $factors): string
    {
        return md5((string) json_encode($this->normalize($factors)));
    }

    private function collectionVersion(int $collectionId): int
    {
        return (int) Cache::get(self::VERSION_PREFIX.$collectionId, 1);
    }

    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>
     */
    private function normalize(array $value): array
    {
        ksort($value);

        foreach ($value as $key => $entry) {
            if (is_array($entry)) {
                $value[$key] = $this->normalize($entry);
            }
        }

        return $value;
    }
}
