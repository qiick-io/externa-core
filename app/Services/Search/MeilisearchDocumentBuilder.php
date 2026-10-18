<?php

namespace App\Services\Search;

use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemValuesAssembler;

/**
 * Builds Meilisearch documents from published item values + eligibility.
 */
class MeilisearchDocumentBuilder
{
    public function __construct(
        private readonly CollectionItemValuesAssembler $assembler,
    ) {}

    public function documentId(CollectionItem $item): string
    {
        return (string) $item->id;
    }

    /**
     * @return array{eligible: bool, document: array<string, mixed>|null}
     */
    public function build(CollectionItem $item): array
    {
        $item->loadMissing('collection');
        $collection = $item->collection;
        if ($collection === null) {
            return ['eligible' => false, 'document' => null];
        }

        $data = $this->assembler->assemble($item);
        if (! $this->statusAllowsIndex($data)) {
            return ['eligible' => false, 'document' => null];
        }

        $searchable = $this->stringFields($data);
        $document = [
            'id' => $this->documentId($item),
            'collection_id' => (int) $item->collection_id,
            'collection_slug' => (string) $collection->slug,
            'updated_at' => $item->updated_at?->toIso8601String(),
            'searchable_text' => implode(' ', array_values($searchable)),
            ...$searchable,
        ];

        return ['eligible' => true, 'document' => $document];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function statusAllowsIndex(array $data): bool
    {
        /** @var list<string> $allow */
        $allow = config('meilisearch.indexable_statuses', []);
        if ($allow === []) {
            return true;
        }

        if (! array_key_exists('status', $data)) {
            return true;
        }

        $status = $data['status'];
        if (! is_string($status)) {
            return false;
        }

        return in_array($status, $allow, true);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, string>
     */
    private function stringFields(array $data): array
    {
        $out = [];

        foreach ($data as $key => $value) {
            if (! is_string($key) || $key === '') {
                continue;
            }

            if (is_string($value)) {
                $trimmed = trim($value);
                if ($trimmed !== '') {
                    $out[$key] = $trimmed;
                }

                continue;
            }

            // Translatable map: prefer first non-empty string locale value.
            if (is_array($value) && ! array_is_list($value)) {
                foreach ($value as $localeValue) {
                    if (is_string($localeValue) && trim($localeValue) !== '') {
                        $out[$key] = trim($localeValue);
                        break;
                    }
                }
            }
        }

        return $out;
    }
}
