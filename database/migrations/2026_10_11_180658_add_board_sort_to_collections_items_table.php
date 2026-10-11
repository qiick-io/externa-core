<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->unsignedBigInteger('board_sort')->nullable()->after('id');
            $table->index(['collection_id', 'board_sort']);
        });
    }

    public function down(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->dropIndex(['collection_id', 'board_sort']);
            $table->dropColumn('board_sort');
        });
    }
};
