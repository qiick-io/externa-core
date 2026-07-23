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
        Schema::table('collections', function (Blueprint $table) {
            if (Schema::getConnection()->getDriverName() === 'pgsql') {
                $table->jsonb('form_layout')->nullable()->after('is_singleton');
            } else {
                $table->json('form_layout')->nullable()->after('is_singleton');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn('form_layout');
        });
    }
};
