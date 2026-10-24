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
    /** @deprecated Use {@see ttlSeconds()} / config('api.response_cache_ttl'). */
    public const TTL_SECONDS = 120;

    private const VERSION_PREFIX = 'public.api.collver.';

    private const EPOCH_KEY = 'public.api.epoch';

    private const FLUSH_META_KEY = 'public.api.flush_meta';

    private const STATS_PREFIX = 'public.api.stats.';

    /** Local collection versions stay below this; epoch shifts the high digits. */
    private const EPOCH_STRIDE = 1_000_000;

    public function ttlSeconds(): int
    {
        return max(1, (int) config('api.response_cache_ttl', self::TTL_SECONDS));
    }

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
    public function bumpAll(?int $actorUserId = null): void
    {
        $nextEpoch = $this->epoch() + 1;
        Cache::forever(self::EPOCH_KEY, $nextEpoch);
        Cache::forever(self::FLUSH_META_KEY, [
            'at' => now()->toIso8601String(),
            'by_user_id' => $actorUserId,
            'epoch' => $nextEpoch,
        ]);
        Cache::forever($this->statsKey($nextEpoch), ['hits' => 0, 'misses' => 0]);
    }

    /**
     * @return array{at: string|null, by_user_id: int|null, epoch: int|null}
     */
    public function lastFlushMeta(): array
    {
        $meta = Cache::get(self::FLUSH_META_KEY);
        if (! is_array($meta)) {
            return ['at' => null, 'by_user_id' => null, 'epoch' => null];
        }

        return [
            'at' => isset($meta['at']) && is_string($meta['at']) ? $meta['at'] : null,
            'by_user_id' => isset($meta['by_user_id']) && is_numeric($meta['by_user_id'])
                ? (int) $meta['by_user_id']
                : null,
            'epoch' => isset($meta['epoch']) && is_numeric($meta['epoch'])
                ? (int) $meta['epoch']
                : null,
        ];
    }

    /**
     * Hit/miss counters for the current epoch (reset on flush).
     *
     * @return array{hits: int, misses: int}
     */
    public function statsForCurrentEpoch(): array
    {
        $stats = Cache::get($this->statsKey($this->epoch()), ['hits' => 0, 'misses' => 0]);
        if (! is_array($stats)) {
            return ['hits' => 0, 'misses' => 0];
        }

        return [
            'hits' => max(0, (int) ($stats['hits'] ?? 0)),
            'misses' => max(0, (int) ($stats['misses'] ?? 0)),
        ];
    }

    /**
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public function remember(string $key, callable $callback): mixed
    {
        if (Cache::has($key)) {
            $this->incrementStat('hits');

            return Cache::get($key);
        }

        $this->incrementStat('misses');
        $value = $callback();
        Cache::put($key, $value, $this->ttlSeconds());

        return $value;
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

    private function statsKey(int $epoch): string
    {
        return self::STATS_PREFIX.$epoch;
    }

    private function incrementStat(string $field): void
    {
        $key = $this->statsKey($this->epoch());
        $stats = Cache::get($key, ['hits' => 0, 'misses' => 0]);
        if (! is_array($stats)) {
            $stats = ['hits' => 0, 'misses' => 0];
        }
        $stats[$field] = max(0, (int) ($stats[$field] ?? 0)) + 1;
        Cache::forever($key, $stats);
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
