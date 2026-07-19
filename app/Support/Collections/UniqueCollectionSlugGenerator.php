<?php

namespace App\Support\Collections;

use App\Models\Collection;
use Illuminate\Support\Str;

/**
 * Generates unique collection slugs from a name or slug candidate.
 */
class UniqueCollectionSlugGenerator
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

    private function exists(string $slug, ?int $excludeCollectionId): bool
    {
        $query = Collection::query()->where('slug', $slug);
        if ($excludeCollectionId !== null) {
            $query->where('id', '!=', $excludeCollectionId);
        }

        return $query->exists();
    }
}
