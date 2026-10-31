<?php

use App\Services\Api\ApiKeyOwnerService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bind API keys to an owner user for permission-ceiling AuthZ (#215).
 *
 * Backfill: created_by when the user still exists, else first active admin
 * (super-admin, else admin). Ownerless only when no admin exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->foreignId('owner_id')
                ->nullable()
                ->after('created_by')
                ->constrained('users')
                ->nullOnDelete();
        });

        app(ApiKeyOwnerService::class)->backfillMissingOwners();
    }

    public function down(): void
    {
        Schema::table('api_keys', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('owner_id');
        });
    }
};
