<?php

declare(strict_types=1);

namespace App\Data\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use Illuminate\Http\Request;

/**
 * Input for creating or updating a collection item through the shared write Actions.
 */
readonly class CollectionItemWriteData
{
    /**
     * @param  array<string, mixed>  $data  Field payload from the calling surface
     * @param  'draft'|'published'  $version  Persist target when the collection has versioning
     * @param  array<string, mixed>|null  $revisionMeta  Override revision meta passed to the values writer
     */
    public function __construct(
        public Collection $collection,
        public array $data,
        public ?CollectionItem $item = null,
        public bool $creating = true,
        public string $version = 'published',
        public bool $shouldValidate = true,
        public bool $shouldMergeIncoming = true,
        public bool $shouldEnforceVersioningGuard = true,
        public ?Request $request = null,
        public bool $shouldAssertWritableFields = false,
        public string $writableMode = 'update',
        public ?array $revisionMeta = null,
    ) {}
}
