<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Search\MeilisearchSyncDispatcher;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Persists collection item field values, including translatable and relational data.
 */
class CollectionItemValuesWriter
{
    /**
     * @var list<array{item_id: int, field_id: int, locale: ?string, position: int, value: mixed, created_at: Carbon, updated_at: Carbon}>
     */
    private array $pendingRows = [];

    public function __construct(
        private CollectionItemRevisionRecorder $revisionRecorder,
        private OutboundWebhookDispatcher $webhooks,
        private MeilisearchSyncDispatcher $meilisearch,
        private PublicApiResponseCache $responseCache,
    ) {}

    /**
     * Persist normalized field data as rows in `collections_items_values`.
     *
     * @param  array<string, mixed>  $normalizedData
     * @param  array<string, mixed>|null  $revisionMeta  Override revision meta (default source:sync)
     * @param  bool|null  $created  Explicit create vs update; defaults to wasRecentlyCreated
     */
    public function sync(
        CollectionItem $item,
        Collection $collection,
        array $normalizedData,
        ?bool $created = null,
        ?array $revisionMeta = null,
    ): void {
        $collection->loadMissing('fields');

        // Delete + reinsert must be atomic: a failed insert would otherwise leave the item without values.
        DB::transaction(function () use ($item, $collection, $normalizedData, $revisionMeta): void {
            CollectionItemValue::query()->where('item_id', $item->id)->delete();

            $this->pendingRows = [];

            foreach ($collection->fields as $field) {
                if ($field->type->isNoData()) {
                    continue;
                }

                if (! array_key_exists($field->name, $normalizedData)) {
                    continue;
                }

                $value = $normalizedData[$field->name];

                if ($field->translatable) {
                    $this->queueTranslatable($item, $field, is_array($value) ? $value : []);

                    continue;
                }

                $this->queueNonTranslatable($item, $field, $value);
            }

            $this->flushPendingRows();

            $this->revisionRecorder->record($item, $revisionMeta ?? ['source' => 'sync']);

            // Values live on related rows — bump parent audit + updated_at.
            // Set user_updated_id first so save is dirty even when touch lands in the same second.
            $userId = auth()->id();
            if (is_int($userId) || (is_string($userId) && ctype_digit($userId))) {
                $item->user_updated_id = (int) $userId;
            }
            $item->touch();
        });

        $isCreated = $created ?? $item->wasRecentlyCreated;
        $this->webhooks->dispatchItem(
            $isCreated ? 'item.created' : 'item.updated',
            $item,
            $collection,
        );
        $this->meilisearch->dispatchUpsert($item);

        // Synchronous: next public GET must miss and reassemble fresh JSON.
        $this->responseCache->bump((int) $collection->id);

        // Permission checks / prior assemble() may have loadMissing'd fieldValues;
        // rows were replaced above — drop the stale relation so the mutation response is fresh.
        $item->unsetRelation('fieldValues');
    }

    /**
     * @param  array<string, mixed>  $perLocale
     */
    private function queueTranslatable(CollectionItem $item, CollectionField $field, array $perLocale): void
    {
        foreach ($perLocale as $locale => $localeValue) {
            if ($field->usesArrayStorage()) {
                $list = is_array($localeValue) ? $localeValue : [];
                foreach ($list as $position => $entry) {
                    $this->queueRow($item, $field, $locale, (int) $position, $entry);
                }

                continue;
            }

            $this->queueRow($item, $field, $locale, 0, $localeValue);
        }
    }

    private function queueNonTranslatable(CollectionItem $item, CollectionField $field, mixed $value): void
    {
        if ($field->usesArrayStorage()) {
            $list = is_array($value) ? $value : [];
            foreach ($list as $position => $entry) {
                $this->queueRow($item, $field, null, (int) $position, $entry);
            }

            return;
        }

        $this->queueRow($item, $field, null, 0, $value);
    }

    private function queueRow(CollectionItem $item, CollectionField $field, ?string $locale, int $position, mixed $value): void
    {
        if ($value === null) {
            return;
        }

        $now = now();
        $this->pendingRows[] = [
            'item_id' => $item->id,
            'field_id' => $field->id,
            'locale' => $locale,
            'position' => $position,
            // Match Eloquent json cast used by ::create().
            'value' => json_encode($value, JSON_THROW_ON_ERROR),
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    private function flushPendingRows(): void
    {
        if ($this->pendingRows === []) {
            return;
        }

        // Chunk large payloads (many array/locale cells) to stay under driver packet limits.
        foreach (array_chunk($this->pendingRows, 500) as $chunk) {
            CollectionItemValue::query()->insert($chunk);
        }

        $this->pendingRows = [];
    }
}
