<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Webhooks\OutboundWebhookDispatcher;

/**
 * Persists collection item field values, including translatable and relational data.
 */
class CollectionItemValuesWriter
{
    public function __construct(
        private CollectionItemRevisionRecorder $revisionRecorder,
        private OutboundWebhookDispatcher $webhooks,
        private PublicApiResponseCache $responseCache,
    ) {}

    /**
     * Persist normalized field data as rows in `collections_items_values`.
     *
     * @param  array<string, mixed>  $normalizedData
     * @param  bool|null  $created  Explicit create vs update; defaults to wasRecentlyCreated
     */
    public function sync(
        CollectionItem $item,
        Collection $collection,
        array $normalizedData,
        ?bool $created = null,
    ): void {
        $collection->loadMissing('fields');

        CollectionItemValue::query()->where('item_id', $item->id)->delete();

        foreach ($collection->fields as $field) {
            if ($field->type->isNoData()) {
                continue;
            }

            if (! array_key_exists($field->name, $normalizedData)) {
                continue;
            }

            $value = $normalizedData[$field->name];

            if ($field->translatable) {
                $this->syncTranslatable($item, $field, is_array($value) ? $value : []);

                continue;
            }

            $this->syncNonTranslatable($item, $field, $value);
        }

        $this->revisionRecorder->record($item, ['source' => 'sync']);

        // Values live on related rows — bump parent audit + updated_at.
        // Set user_updated_id first so save is dirty even when touch lands in the same second.
        $userId = auth()->id();
        if (is_int($userId) || (is_string($userId) && ctype_digit($userId))) {
            $item->user_updated_id = (int) $userId;
        }
        $item->touch();

        $isCreated = $created ?? $item->wasRecentlyCreated;
        $this->webhooks->dispatchItem(
            $isCreated ? 'item.created' : 'item.updated',
            $item,
            $collection,
        );

        // Synchronous: next public GET must miss and reassemble fresh JSON.
        $this->responseCache->bump((int) $collection->id);

        // Permission checks / prior assemble() may have loadMissing'd fieldValues;
        // rows were replaced above — drop the stale relation so the mutation response is fresh.
        $item->unsetRelation('fieldValues');
    }

    /**
     * @param  array<string, mixed>  $perLocale
     */
    private function syncTranslatable(CollectionItem $item, CollectionField $field, array $perLocale): void
    {
        foreach ($perLocale as $locale => $localeValue) {
            if ($field->usesArrayStorage()) {
                $list = is_array($localeValue) ? $localeValue : [];
                foreach ($list as $position => $entry) {
                    $this->insertRow($item, $field, $locale, (int) $position, $entry);
                }

                continue;
            }

            $this->insertRow($item, $field, $locale, 0, $localeValue);
        }
    }

    private function syncNonTranslatable(CollectionItem $item, CollectionField $field, mixed $value): void
    {
        if ($field->usesArrayStorage()) {
            $list = is_array($value) ? $value : [];
            foreach ($list as $position => $entry) {
                $this->insertRow($item, $field, null, (int) $position, $entry);
            }

            return;
        }

        $this->insertRow($item, $field, null, 0, $value);
    }

    private function insertRow(CollectionItem $item, CollectionField $field, ?string $locale, int $position, mixed $value): void
    {
        if ($value === null) {
            return;
        }

        CollectionItemValue::query()->create([
            'item_id' => $item->id,
            'field_id' => $field->id,
            'locale' => $locale,
            'position' => $position,
            'value' => $value,
        ]);
    }
}
