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
        Schema::create('fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('collection_id')->constrained('collections')->cascadeOnDelete();
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
            DB::statement('CREATE INDEX fields_collection_sort_index ON fields (collection_id, sort_order)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fields');
    }
};
