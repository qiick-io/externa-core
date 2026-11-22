<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stop deleting a role from cascading every API key that still holds it (#833).
 *
 * The create migration kept `cascadeOnDelete` for installs that already ran it; this
 * additive change switches the live FK to `restrictOnDelete` so a raw DELETE cannot
 * wipe keys either. Application code refuses the delete first with a counted message.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropForeign(['role_id']);
        });

        Schema::table('api_keys', function (Blueprint $table): void {
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropForeign(['role_id']);
        });

        Schema::table('api_keys', function (Blueprint $table): void {
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });
    }
};
