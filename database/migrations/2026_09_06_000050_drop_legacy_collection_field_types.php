<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Drop leftover Kitchen Sink aliases: file, relation, relation_many, relation_tree.
 * Prefer files / many_to_one / one_to_many / many_to_many instead.
 * Item values cascade via collections_items_values.field_id FK.
 */
return new class extends Migration
{
    private const LEGACY_TYPES = [
        'file',
        'relation',
        'relation_many',
        'relation_tree',
    ];

    public function up(): void
    {
        DB::table('collections_fields')
            ->whereIn('type', self::LEGACY_TYPES)
            ->delete();
    }

    public function down(): void
    {
        // Irreversible: legacy types removed from FieldTypeEnum.
    }
};
