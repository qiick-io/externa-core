<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->text('schedule_error')->nullable()->after('publish_at');
            $table->timestamp('schedule_failed_at')->nullable()->after('schedule_error');
        });
    }

    public function down(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->dropColumn(['schedule_error', 'schedule_failed_at']);
        });
    }
};
