<?php

namespace App\Console\Commands;

use App\Services\FileService;
use Illuminate\Console\Command;

class CleanupStaleFileUploadsCommand extends Command
{
    protected $signature = 'files:cleanup-uploads';

    protected $description = 'Remove expired partial file uploads and their chunk storage';

    public function handle(FileService $fileService): int
    {
        $cleanedCount = $fileService->cleanupStaleUploads();

        $this->info(sprintf('Cleaned up %d stale file upload(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
