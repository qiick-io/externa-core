<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Add columns for two-factor authentication to the users table.
     * - two_factor_secret: Stores encrypted secret used to generate 2FA codes.
     * - two_factor_recovery_codes: Stores encrypted recovery codes for account recovery.
     * - two_factor_confirmed_at: Timestamp for when two-factor was confirmed by user.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Add two_factor_secret column after the password column, nullable for users without 2FA.
            $table->text('two_factor_secret')->after('password')->nullable();

            // Add two_factor_recovery_codes column after two_factor_secret, nullable for users without 2FA.
            $table->text('two_factor_recovery_codes')->after('two_factor_secret')->nullable();

            // Add two_factor_confirmed_at timestamp after two_factor_recovery_codes, nullable in case not set.
            $table->timestamp('two_factor_confirmed_at')->after('two_factor_recovery_codes')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     *
     * Remove the two-factor authentication columns from the users table.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Drop the columns related to two-factor authentication.
            $table->dropColumn([
                'two_factor_secret',
                'two_factor_recovery_codes',
                'two_factor_confirmed_at',
            ]);
        });
    }
};
