<?php

namespace App\Console\Commands;

use App\Services\FileService;
use Illuminate\Console\Command;

/**
 * Artisan command that removes abandoned chunked file upload sessions.
 */
/**
 * Artisan command to remove expired partial file uploads.
 */
class CleanupStaleFileUploadsCommand extends Command
{
    protected $signature = 'files:cleanup-uploads';

    protected $description = 'Remove expired partial file uploads and their chunk storage';

    /**
     * Execute the command.
     */

    /**
     * Remove expired partial uploads via FileService.
     */
    public function handle(FileService $fileService): int
    {
        $cleanedCount = $fileService->cleanupStaleUploads();

        $this->info(sprintf('Cleaned up %d stale file upload(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
