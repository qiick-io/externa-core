<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use Illuminate\Support\Collection as SupportCollection;

/**
 * Detects whether a field already has stored content that would break if type or
 * translatable storage shape changed (no conversion tooling yet — see #220).
 */
class CollectionFieldStorageShapeService
{
    /**
     * User-facing message when a type change is blocked.
     */
    public function typeChangeBlockedMessage(): string
    {
        return __('This field already has content. Changing its type would not convert existing values. Create a new field and migrate the content instead.');
    }

    /**
     * User-facing message when a translatable flag change is blocked.
     */
    public function translatableChangeBlockedMessage(): string
    {
        return __('This field already has content. Changing the Translatable setting would not convert existing values. Create a new field and migrate the content instead.');
    }

    /**
     * True when the field has at least one published value row or draft_data key
     * (including soft-deleted items).
     */
    public function hasStoredValues(CollectionField $field): bool
    {
        if (CollectionItemValue::query()->where('field_id', $field->id)->exists()) {
            return true;
        }

        return CollectionItem::withTrashed()
            ->where('collection_id', $field->collection_id)
            ->whereNotNull('draft_data')
            ->whereNotNull('draft_data->'.$field->name)
            ->exists();
    }

    /**
     * Map of field id => has stored values for every field on the collection.
     *
     * @return array<int, bool>
     */
    public function storedValueFlagsByFieldId(Collection $collection): array
    {
        $fields = $collection->relationLoaded('fields')
            ? $collection->fields
            : $collection->fields()->get();

        if ($fields->isEmpty()) {
            return [];
        }

        /** @var SupportCollection<int, int> $fieldIds */
        $fieldIds = $fields->modelKeys();

        $idsWithPublishedValues = CollectionItemValue::query()
            ->whereIn('field_id', $fieldIds)
            ->distinct()
            ->pluck('field_id')
            ->all();

        $idsWithPublishedValues = array_fill_keys(array_map('intval', $idsWithPublishedValues), true);

        $namesById = [];
        foreach ($fields as $field) {
            $namesById[(int) $field->id] = (string) $field->name;
        }

        $draftNames = [];
        CollectionItem::withTrashed()
            ->where('collection_id', $collection->id)
            ->whereNotNull('draft_data')
            ->select(['id', 'draft_data'])
            ->orderBy('id')
            ->chunkById(200, function (SupportCollection $items) use (&$draftNames): void {
                foreach ($items as $item) {
                    $draft = is_array($item->draft_data) ? $item->draft_data : [];
                    foreach (array_keys($draft) as $name) {
                        $draftNames[(string) $name] = true;
                    }
                }
            });

        $flags = [];
        foreach ($namesById as $fieldId => $name) {
            $flags[$fieldId] = isset($idsWithPublishedValues[$fieldId]) || isset($draftNames[$name]);
        }

        return $flags;
    }

    /**
     * Whether the requested type differs from the field's current type.
     */
    public function isTypeChange(CollectionField $field, mixed $requestedType): bool
    {
        if ($requestedType === null || $requestedType === '') {
            return false;
        }

        $type = $requestedType instanceof FieldTypeEnum
            ? $requestedType
            : FieldTypeEnum::tryFrom((string) $requestedType);

        if ($type === null) {
            return false;
        }

        return $type !== $field->type;
    }

    /**
     * Whether the requested translatable flag differs from the field's current value.
     */
    public function isTranslatableChange(CollectionField $field, bool $requestedTranslatable): bool
    {
        return $requestedTranslatable !== (bool) $field->translatable;
    }
}
