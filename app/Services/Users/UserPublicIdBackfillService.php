<?php

declare(strict_types=1);

namespace App\Services\Users;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Idempotent UUID v7 backfill for `users.public_id` (#827 step 2).
 *
 * Existing rows stay on the bigint primary key; only null `public_id` values are filled,
 * in chunks, so a large install can resume after an interrupt.
 */
final class UserPublicIdBackfillService
{
    /**
     * How many users still need a public_id.
     */
    public function missingCount(): int
    {
        return (int) DB::table('users')->whereNull('public_id')->count();
    }

    /**
     * Fill null `public_id` values in chunks. Idempotent: already-filled rows are skipped.
     *
     * @return int Number of rows written
     */
    public function backfill(int $chunkSize = 500): int
    {
        $written = 0;

        do {
            $userIds = DB::table('users')
                ->whereNull('public_id')
                ->orderBy('id')
                ->limit($chunkSize)
                ->pluck('id');

            if ($userIds->isEmpty()) {
                break;
            }

            foreach ($userIds as $userId) {
                DB::table('users')
                    ->where('id', $userId)
                    ->whereNull('public_id')
                    ->update(['public_id' => (string) Str::uuid7()]);
                $written++;
            }
        } while ($userIds->count() === $chunkSize);

        return $written;
    }
}
