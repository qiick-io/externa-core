<?php

use App\Services\Files\FileEffectiveAccessService;
use Illuminate\Database\Migrations\Migration;

/**
 * Compute `files.effective_access` for rows that predate the column (#434).
 *
 * Installs upgraded from 1.3.0 have NULL on every file. Runs the same idempotent
 * backfill as `files:backfill-effective-access`, so `migrate` / `externa:upgrade`
 * need no manual step.
 */
return new class extends Migration
{
    public function up(): void
    {
        app(FileEffectiveAccessService::class)->backfillAll();
    }

    /**
     * Data-only migration: the computed values stay valid, nothing to undo.
     */
    public function down(): void
    {
        //
    }
};
