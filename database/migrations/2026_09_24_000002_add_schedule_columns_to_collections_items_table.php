<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->timestamp('publish_at')->nullable()->after('draft_data');
            $table->timestamp('unpublish_at')->nullable()->after('publish_at');
            $table->index('publish_at');
            $table->index('unpublish_at');
        });
    }

    public function down(): void
    {
        Schema::table('collections_items', function (Blueprint $table) {
            $table->dropIndex(['publish_at']);
            $table->dropIndex(['unpublish_at']);
            $table->dropColumn(['publish_at', 'unpublish_at']);
        });
    }
};
