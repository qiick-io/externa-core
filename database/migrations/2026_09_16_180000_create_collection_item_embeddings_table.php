<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collection_item_embeddings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('collection_item_id')->constrained('collections_items')->cascadeOnDelete();
            $table->string('provider')->default('openai');
            $table->string('model')->nullable();
            // ponytail: JSON float[] works on sqlite/mysql/pgsql; upgrade path = pgvector column later
            $table->json('vector');
            $table->string('content_hash', 64)->nullable();
            $table->timestamps();

            $table->unique('collection_item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_item_embeddings');
    }
};
