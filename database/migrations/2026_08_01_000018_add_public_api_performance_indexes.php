<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE INDEX IF NOT EXISTS collections_items_collection_id_id_index ON collections_items (collection_id, id DESC)');

        DB::statement('CREATE INDEX IF NOT EXISTS collections_items_values_field_position_locale_index ON collections_items_values (field_id, position, locale)');

        $valueType = DB::selectOne(
            "SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'collections_items_values' AND column_name = 'value'"
        );

        if ($valueType !== null && $valueType->data_type === 'jsonb') {
            DB::statement('CREATE INDEX IF NOT EXISTS collections_items_values_value_gin_index ON collections_items_values USING GIN (value jsonb_path_ops)');
        }
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS collections_items_values_value_gin_index');
        DB::statement('DROP INDEX IF EXISTS collections_items_values_field_position_locale_index');
        DB::statement('DROP INDEX IF EXISTS collections_items_collection_id_id_index');
    }
};
