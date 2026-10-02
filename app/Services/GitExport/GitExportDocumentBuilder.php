<?php

namespace App\Services\GitExport;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemValuesAssembler;

/**
 * Builds relative path + file body for one published item in the export repo.
 */
class GitExportDocumentBuilder
{
    public function __construct(
        private readonly CollectionItemValuesAssembler $assembler,
    ) {}

    public function collectionAllowed(Collection $collection): bool
    {
        $raw = (string) config('git_export.collection_slugs', '*');
        $raw = trim($raw);
        if ($raw === '' || $raw === '*') {
            return true;
        }

        $slugs = array_values(array_filter(array_map('trim', explode(',', $raw))));

        return in_array($collection->slug, $slugs, true);
    }

    /**
     * @return array{path: string, contents: string}|null
     */
    public function build(CollectionItem $item): ?array
    {
        $item->loadMissing('collection');
        $collection = $item->collection;
        if (! $collection instanceof Collection || ! $this->collectionAllowed($collection)) {
            return null;
        }

        $data = $this->assembler->assemble($item);
        $format = strtolower((string) config('git_export.format', 'json'));
        $slug = $collection->slug;

        if ($format === 'markdown') {
            return [
                'path' => "content/{$slug}/{$item->id}.md",
                'contents' => $this->toMarkdown($item, $collection, $data),
            ];
        }

        return [
            'path' => "content/{$slug}/{$item->id}.json",
            'contents' => json_encode([
                'id' => $item->id,
                'collection_id' => $collection->id,
                'collection_slug' => $slug,
                'updated_at' => $item->updated_at?->toIso8601String(),
                'data' => $data,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n",
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function toMarkdown(CollectionItem $item, Collection $collection, array $data): string
    {
        $title = is_string($data['title'] ?? null) ? $data['title'] : "Item {$item->id}";
        $body = '';
        foreach (['body', 'content', 'text'] as $key) {
            if (is_string($data[$key] ?? null) && trim($data[$key]) !== '') {
                $body = $data[$key];
                break;
            }
        }

        $meta = [
            'id' => $item->id,
            'collection' => $collection->slug,
            'updated_at' => $item->updated_at?->toIso8601String(),
        ];

        $yaml = '';
        foreach ($meta as $key => $value) {
            $yaml .= $key.': '.json_encode($value, JSON_UNESCAPED_UNICODE)."\n";
        }

        return "---\n{$yaml}---\n\n# {$title}\n\n{$body}\n";
    }
}
