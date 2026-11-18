<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;
use App\Models\CollectionField;

/**
 * Duplicate a collection field under a unique `<name>_copy` / `<name>_copy_<n>` name.
 */
final class DuplicateCollectionFieldAction
{
    public function execute(Collection $collection, CollectionField $field): CollectionField
    {
        $duplicate = $field->replicate(['sort_order']);
        $duplicate->name = $this->uniqueDuplicateFieldName($collection, $field->name);
        $duplicate->save();

        return $duplicate;
    }

    /**
     * Generate a unique duplicate field name within the collection.
     */
    private function uniqueDuplicateFieldName(Collection $collection, string $baseName): string
    {
        $candidate = $baseName.'_copy';
        $suffix = 2;

        while ($collection->fields()->where('name', $candidate)->exists()) {
            $candidate = $baseName.'_copy_'.$suffix;
            $suffix++;
        }

        return $candidate;
    }
}
