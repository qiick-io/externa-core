<?php

namespace App\Support\Cms;

use App\Models\ContentCollection;
use Illuminate\Support\Str;

class UniqueCollectionSlug
{
    public function make(string $nameOrSlug, ?int $excludeCollectionId = null): string
    {
        $base = Str::slug($nameOrSlug);
        if ($base === '') {
            $base = 'collection';
        }

        $slug = $base;
        $n = 2;
        while ($this->exists($slug, $excludeCollectionId)) {
            $slug = $base.'-'.$n;
            $n++;
        }

        return $slug;
    }

    private function exists(string $slug, ?int $excludeCollectionId): bool
    {
        $q = ContentCollection::query()->where('slug', $slug);
        if ($excludeCollectionId !== null) {
            $q->where('id', '!=', $excludeCollectionId);
        }

        return $q->exists();
    }
}
