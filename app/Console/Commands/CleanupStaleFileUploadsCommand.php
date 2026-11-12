<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\FileChunkUploadService;
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
     * Remove expired partial uploads via FileChunkUploadService.
     */
    public function handle(FileChunkUploadService $chunkUploads): int
    {
        $cleanedCount = $chunkUploads->cleanupStaleUploads();

        $this->info(sprintf('Cleaned up %d stale file upload(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
