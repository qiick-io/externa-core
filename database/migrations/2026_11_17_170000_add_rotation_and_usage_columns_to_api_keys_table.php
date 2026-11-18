<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rotation and usage columns from the shared API key baseline (#781).
 *
 * - `previous_key_hash` / `previous_key_valid_until`: a rotated key's old secret keeps working
 *   until the end of the grace window, so an integration can switch without downtime.
 * - `last_used_ip`: shown beside `last_used_at`, so a key used from somewhere new is visible.
 * - `key_prefix` grows to 32 characters for the `ext_<env>_<id>` public identifier; legacy
 *   `ek_` prefixes (12 characters) are kept as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->string('key_prefix', 32)->change();
            $table->string('previous_key_hash', 64)->nullable()->after('key_hash');
            $table->timestamp('previous_key_valid_until')->nullable()->after('previous_key_hash');
            $table->string('last_used_ip', 45)->nullable()->after('last_used_at');
        });
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropColumn(['previous_key_hash', 'previous_key_valid_until', 'last_used_ip']);
        });
    }
};
