<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Remembers which API key asked for a pending MCP tool call, so the approved call runs
 * with that key's role and scopes instead of the owner's full permissions (#441).
 * Existing rows keep null: they were created by session users or before this change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pending_tool_calls', function (Blueprint $table): void {
            $table->foreignId('api_key_id')
                ->nullable()
                ->after('requested_by')
                ->constrained('api_keys')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pending_tool_calls', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('api_key_id');
        });
    }
};
