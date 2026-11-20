<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Binds every OAuth access token to the grant it was issued under (`api_key_id`, the grant's
 * `api_keys` row) and records the resource it is for (`audience`, RFC 8707), both written when
 * the token is issued (#802). A token without either is refused, and deleting a grant deletes its
 * tokens. Passport's own columns are unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oauth_access_tokens', function (Blueprint $table): void {
            $table->foreignId('api_key_id')->nullable()->after('client_id')->constrained('api_keys')->cascadeOnDelete();
            $table->string('audience', 512)->nullable()->after('api_key_id');
        });
    }

    public function down(): void
    {
        Schema::table('oauth_access_tokens', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('api_key_id');
            $table->dropColumn('audience');
        });
    }
};
