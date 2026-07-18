<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Create the main collections table to hold each collection's basic info
        Schema::create('collections', function (Blueprint $table) {
            $table->id(); // Primary key
            $table->string('name'); // Collection display name
            $table->string('slug')->unique(); // Unique identifier for the collection
            $table->boolean('is_singleton')->default(false); // Single record collection flag
            $table->unsignedInteger('sort_order')->default(0); // Sort order for UI or queries
            $table->timestamps(); // created_at, updated_at
            $table->softDeletes();
        });

        // On PostgreSQL, add an explicit index for sort_order
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_sort_order_index ON collections (sort_order)');
        }

        // Create the fields table for each collection's fields definition
        Schema::create('collections_fields', function (Blueprint $table) {
            $table->id(); // Primary key
            $table->foreignId('collection_id') // Foreign key to collections
                ->constrained('collections')
                ->cascadeOnDelete();
            $table->string('name'); // Field name
            $table->string('type'); // Field type (e.g. string, integer, etc)
            $table->boolean('translatable')->default(false); // Whether values are translatable
            // Store field settings as JSON (jsonb on PostgreSQL)
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                $table->jsonb('settings')->nullable();
            } else {
                $table->json('settings')->nullable();
            }
            $table->unsignedInteger('sort_order')->default(0); // For field ordering in the collection
            $table->timestamps(); // created_at, updated_at

            $table->unique(['collection_id', 'name']); // Ensure field name is unique within a collection
        });

        // On PostgreSQL, add an index to optimize queries involving collection & sort order
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_fields_collection_sort_index ON collections_fields (collection_id, sort_order)');
        }

        // Table for collection items (instances of a collection)
        Schema::create('collections_items', function (Blueprint $table) {
            $table->id(); // Primary key
            $table->foreignId('collection_id') // Foreign key to collections
                ->constrained('collections')
                ->cascadeOnDelete();
            $table->timestamps(); // created_at, updated_at
            $table->softDeletes();
        });

        // On PostgreSQL, add an index for fast lookup by collection_id
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_items_collection_id_index ON collections_items (collection_id)');
        }

        // Table for storing values of each item-field, including translations, positions, etc
        Schema::create('collections_items_values', function (Blueprint $table) {
            $table->id(); // Primary key
            $table->foreignId('item_id') // References an item (row in collections_items)
                ->constrained('collections_items')
                ->cascadeOnDelete();
            $table->foreignId('field_id') // References a field definition
                ->constrained('collections_fields')
                ->cascadeOnDelete();
            $table->string('locale', 16)->nullable(); // For translatable field values
            $table->unsignedSmallInteger('position')->default(0); // For repeatable/array fields
            // Field value (jsonb for PostgreSQL)
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                $table->jsonb('value');
            } else {
                $table->json('value');
            }
            $table->timestamps(); // created_at, updated_at

            // Unique constraint for value slot: (item, field, locale, position)
            $table->unique(
                ['item_id', 'field_id', 'locale', 'position'],
                'collections_items_values_unique_slot'
            );
        });

        // On PostgreSQL, add an index for field_id to speed up fetching field values
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_items_values_field_id_index ON collections_items_values (field_id)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Drop tables in reverse order to handle foreign key dependencies
        Schema::dropIfExists('collections_items_values');
        Schema::dropIfExists('collections_items');
        Schema::dropIfExists('collections_fields');
        Schema::dropIfExists('collections');
    }
};
