<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->index(['collection_id', 'published_at']);
            $table->index(['collection_id', 'created_at']);
            $table->index(['collection_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->dropIndex(['collection_id', 'published_at']);
            $table->dropIndex(['collection_id', 'created_at']);
            $table->dropIndex(['collection_id', 'updated_at']);
        });
    }
};
