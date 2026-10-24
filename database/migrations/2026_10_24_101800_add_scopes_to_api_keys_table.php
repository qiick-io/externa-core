<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Optional narrowing scopes on API keys (collection allowlist + read-only).
 * null collection_slugs = unrestricted (legacy behaviour); read_only false = full role ACL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->json('collection_slugs')->nullable()->after('role_id');
            $table->boolean('read_only')->default(false)->after('collection_slugs');
        });
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropColumn(['collection_slugs', 'read_only']);
        });
    }
};
