<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Postgres-only composite / GIN indexes for public API list + filter hot paths.
     * MySQL / SQLite: no-op.
     */
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        // Liste latest('id') scoped by collection
        DB::statement('CREATE INDEX IF NOT EXISTS collections_items_collection_id_id_index ON collections_items (collection_id, id DESC)');

        // whereHas filters on field values
        DB::statement('CREATE INDEX IF NOT EXISTS collections_items_values_field_position_locale_index ON collections_items_values (field_id, position, locale)');

        // Equality / containment on jsonb values (LIKE _contains still seq-scan-ish)
        $valueType = DB::selectOne(
            "SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'collections_items_values' AND column_name = 'value'"
        );

        if ($valueType !== null && $valueType->data_type === 'jsonb') {
            DB::statement('CREATE INDEX IF NOT EXISTS collections_items_values_value_gin_index ON collections_items_values USING GIN (value jsonb_path_ops)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS collections_items_collection_id_id_index');
        DB::statement('DROP INDEX IF EXISTS collections_items_values_field_position_locale_index');
        DB::statement('DROP INDEX IF EXISTS collections_items_values_value_gin_index');
    }
};
