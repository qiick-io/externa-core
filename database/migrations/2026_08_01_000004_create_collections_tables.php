<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collections', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_singleton')->default(false);
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                $table->jsonb('form_layout')->nullable();
            } else {
                $table->json('form_layout')->nullable();
            }
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();
        });

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_sort_order_index ON collections (sort_order)');
        }

        Schema::create('collections_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('collection_id')
                ->constrained('collections')
                ->cascadeOnDelete();
            $table->string('name');
            $table->string('type');
            $table->boolean('translatable')->default(false);
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                $table->jsonb('settings')->nullable();
            } else {
                $table->json('settings')->nullable();
            }
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['collection_id', 'name']);
        });

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_fields_collection_sort_index ON collections_fields (collection_id, sort_order)');
        }

        Schema::create('collections_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('collection_id')
                ->constrained('collections')
                ->cascadeOnDelete();
            $table->foreignId('user_created_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('user_updated_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_items_collection_id_index ON collections_items (collection_id)');
        }

        Schema::create('collections_items_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')
                ->constrained('collections_items')
                ->cascadeOnDelete();
            $table->foreignId('field_id')
                ->constrained('collections_fields')
                ->cascadeOnDelete();
            $table->string('locale', 16)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                $table->jsonb('value');
            } else {
                $table->json('value');
            }
            $table->timestamps();

            $table->unique(
                ['item_id', 'field_id', 'locale', 'position'],
                'collections_items_values_unique_slot'
            );
        });

        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX collections_items_values_field_id_index ON collections_items_values (field_id)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('collections_items_values');
        Schema::dropIfExists('collections_items');
        Schema::dropIfExists('collections_fields');
        Schema::dropIfExists('collections');
    }
};
