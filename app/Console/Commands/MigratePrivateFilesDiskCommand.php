<?php

namespace App\Console\Commands;

use App\Services\FileService;
use Illuminate\Console\Command;

/**
 * Move effective-private local assets off the public assets disk.
 */
class MigratePrivateFilesDiskCommand extends Command
{
    protected $signature = 'files:migrate-private-disk';

    protected $description = 'Move effective-private file bytes from public assets to private_assets';

    public function handle(FileService $fileService): int
    {
        $moved = $fileService->migratePrivateFilesToPrivateDisk();

        $this->info(sprintf('Moved %d file(s) to the private assets disk.', $moved));

        return self::SUCCESS;
    }
}
