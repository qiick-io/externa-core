<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasIndex('files', ['parent_id', 'name'], 'unique')) {
            return;
        }

        Schema::table('files', function (Blueprint $table) {
            $table->dropUnique(['parent_id', 'name']);
            $table->index(['parent_id', 'name']);
        });
    }

    public function down(): void
    {
        if (Schema::hasIndex('files', ['parent_id', 'name'], 'unique')) {
            return;
        }

        Schema::table('files', function (Blueprint $table) {
            $table->dropIndex(['parent_id', 'name']);
            $table->unique(['parent_id', 'name']);
        });
    }
};
