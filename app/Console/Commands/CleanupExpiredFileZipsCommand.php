<?php

namespace App\Console\Commands;

use App\Services\FileService;
use Illuminate\Console\Command;

/**
 * Artisan command that deletes expired prepared file ZIP archives.
 */
/**
 * Artisan command to remove expired prepared zip downloads.
 */
class CleanupExpiredFileZipsCommand extends Command
{
    protected $signature = 'files:cleanup-zips';

    protected $description = 'Remove expired prepared zip downloads';

    /**
     * Execute the command.
     */

    /**
     * Remove expired zip files via FileService.
     */
    public function handle(FileService $fileService): int
    {
        $cleanedCount = $fileService->cleanupExpiredZips();

        $this->info(sprintf('Cleaned up %d expired zip(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
