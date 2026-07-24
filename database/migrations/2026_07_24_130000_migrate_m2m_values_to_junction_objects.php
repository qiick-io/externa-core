<?php

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Models\CollectionItemValue;
use Illuminate\Database\Migrations\Migration;

/**
 * Breaking change: M2M value rows become `{ related_item_id, meta }` objects.
 * Bare integer IDs are migrated in place.
 */
return new class extends Migration
{
    public function up(): void
    {
        $fieldIds = CollectionField::query()
            ->where('type', FieldTypeEnum::ManyToMany->value)
            ->pluck('id');

        if ($fieldIds->isEmpty()) {
            return;
        }

        CollectionItemValue::query()
            ->whereIn('field_id', $fieldIds)
            ->orderBy('id')
            ->chunkById(200, function ($rows): void {
                foreach ($rows as $row) {
                    $value = $row->value;
                    if (is_numeric($value)) {
                        $row->forceFill([
                            'value' => [
                                'related_item_id' => (int) $value,
                                'meta' => [],
                            ],
                        ])->saveQuietly();
                    }
                }
            });
    }

    public function down(): void
    {
        $fieldIds = CollectionField::query()
            ->where('type', FieldTypeEnum::ManyToMany->value)
            ->pluck('id');

        if ($fieldIds->isEmpty()) {
            return;
        }

        CollectionItemValue::query()
            ->whereIn('field_id', $fieldIds)
            ->orderBy('id')
            ->chunkById(200, function ($rows): void {
                foreach ($rows as $row) {
                    $value = $row->value;
                    if (is_array($value) && isset($value['related_item_id'])) {
                        $row->forceFill(['value' => (int) $value['related_item_id']])->saveQuietly();
                    }
                }
            });
    }
};
