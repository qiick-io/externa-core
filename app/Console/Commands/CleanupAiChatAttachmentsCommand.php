<?php

namespace App\Console\Commands;

use App\Models\AiChatAttachment;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('ai:cleanup-attachments')]
#[Description('Remove expired AI chat attachments and their temporary files')]
/**
 * Artisan command that purges expired AI chat attachments from storage.
 */
class CleanupAiChatAttachmentsCommand extends Command
{
    /**
     * Execute the command.
     */
    /**
     * Delete expired attachment records and their storage files.
     */
    public function handle(): int
    {
        $expired = AiChatAttachment::query()
            ->where('expires_at', '<', now())
            ->get();

        $cleanedCount = 0;

        foreach ($expired as $attachment) {
            $attachment->delete();
            $cleanedCount++;
        }

        $this->info(sprintf('Cleaned up %d expired AI chat attachment(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
