<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Explicit per-key file access (none|read|all). Existing keys keep 1.3.0 behaviour (all).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->string('files_scope', 16)->default('all')->after('read_only');
        });

        // Belt: ensure migrated rows are 'all' (preserves pre-1.4.0 file access).
        DB::table('api_keys')->whereNull('files_scope')->update(['files_scope' => 'all']);
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropColumn('files_scope');
        });
    }
};
