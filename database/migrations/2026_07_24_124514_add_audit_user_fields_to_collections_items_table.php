<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->foreignId('user_created_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('user_updated_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_created_id');
            $table->dropConstrainedForeignId('user_updated_id');
        });
    }
};
