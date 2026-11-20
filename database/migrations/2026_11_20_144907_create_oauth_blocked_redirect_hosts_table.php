<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Redirect hosts an admin blocked from MCP OAuth dynamic client registration (#815).
 *
 * Registration compares the host of each requested redirect URI (lower-cased) against this
 * table and refuses with `invalid_redirect_uri` when it matches.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oauth_blocked_redirect_hosts', function (Blueprint $table): void {
            $table->id();
            $table->string('host')->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oauth_blocked_redirect_hosts');
    }
};
