<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Postgres treats NULL as distinct in UNIQUE indexes, so non-translatable values
 * (locale IS NULL) can duplicate the same (item_id, field_id, position) slot.
 * Rebuild the unique constraint with NULLS NOT DISTINCT after a dedupe pass.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        // Keep the newest row per NULL-locale slot; drop older duplicates.
        DB::statement(<<<'SQL'
            DELETE FROM collections_items_values a
            USING collections_items_values b
            WHERE a.locale IS NULL
              AND b.locale IS NULL
              AND a.item_id = b.item_id
              AND a.field_id = b.field_id
              AND a.position = b.position
              AND a.id < b.id
            SQL);

        Schema::table('collections_items_values', function (Blueprint $table) {
            $table->dropUnique('collections_items_values_unique_slot');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX collections_items_values_unique_slot
            ON collections_items_values (item_id, field_id, locale, position)
            NULLS NOT DISTINCT
            SQL);
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS collections_items_values_unique_slot');

        Schema::table('collections_items_values', function (Blueprint $table) {
            $table->unique(
                ['item_id', 'field_id', 'locale', 'position'],
                'collections_items_values_unique_slot'
            );
        });
    }
};
