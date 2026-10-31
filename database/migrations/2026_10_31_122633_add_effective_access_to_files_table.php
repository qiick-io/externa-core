<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Denormalized resolved visibility for list AuthZ without loading the full tree.
 *
 * `access` remains the override (null = inherit). `effective_access` is always
 * public|private after compute/backfill.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('files', function (Blueprint $table): void {
            $table->string('effective_access', 16)->nullable()->after('access');
            $table->index('effective_access');
        });
    }

    public function down(): void
    {
        Schema::table('files', function (Blueprint $table): void {
            $table->dropIndex(['effective_access']);
            $table->dropColumn('effective_access');
        });
    }
};
