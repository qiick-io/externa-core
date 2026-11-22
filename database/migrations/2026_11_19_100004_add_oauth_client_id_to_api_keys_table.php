<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An OAuth grant to a remote MCP client is stored as an `api_keys` row with the client's id
 * (#802), so a token and an API key reach every authorization decision through the same row:
 * role, `scopes`, `collection_slugs`, owner ceiling and revocation. Existing keys keep null and
 * are untouched; a grant row never has a usable bearer secret.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->uuid('oauth_client_id')->nullable()->after('owner_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropIndex(['oauth_client_id']);
            $table->dropColumn('oauth_client_id');
        });
    }
};
