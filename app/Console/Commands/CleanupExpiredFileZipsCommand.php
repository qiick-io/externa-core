<?php

namespace App\Console\Commands;

use App\Services\FileService;
use Illuminate\Console\Command;

class CleanupExpiredFileZipsCommand extends Command
{
    protected $signature = 'files:cleanup-zips';

    protected $description = 'Remove expired prepared zip downloads';

    public function handle(FileService $fileService): int
    {
        $cleanedCount = $fileService->cleanupExpiredZips();

        $this->info(sprintf('Cleaned up %d expired zip(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
