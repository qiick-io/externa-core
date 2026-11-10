<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Named capability scopes for API keys (e.g. mcp:read, mcp:write).
 *
 * null = no named scopes (legacy keys cannot call MCP until scopes are granted).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->json('scopes')->nullable()->after('files_scope');
        });
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropColumn('scopes');
        });
    }
};
