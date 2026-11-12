<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Models\Collection;
use Illuminate\Support\Str;

/**
 * Generates unique collection slugs from a name or slug candidate.
 *
 * Kept for pack/import helpers that still need silent uniquify; store/update
 * FormRequests validate uniqueness instead (like field keys).
 */
class UniqueCollectionSlugGeneratorService
{
    /**
     * Produce a unique slug, appending numeric suffixes when needed.
     */
    public function make(string $nameOrSlug, ?int $excludeCollectionId = null): string
    {
        $base = Str::slug($nameOrSlug);
        if ($base === '') {
            $base = 'collection';
        }

        $slug = $base;
        $suffix = 2;
        while ($this->exists($slug, $excludeCollectionId)) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return $slug;
    }

    /**
     * Whether the normalized slug is free (includes soft-deleted rows).
     */
    public function isAvailable(string $nameOrSlug, ?int $excludeCollectionId = null): bool
    {
        $slug = Str::slug($nameOrSlug);

        if ($slug === '') {
            return false;
        }

        return ! $this->exists($slug, $excludeCollectionId);
    }

    private function exists(string $slug, ?int $excludeCollectionId): bool
    {
        $query = Collection::query()->withTrashed()->where('slug', $slug);
        if ($excludeCollectionId !== null) {
            $query->where('id', '!=', $excludeCollectionId);
        }

        return $query->exists();
    }
}
