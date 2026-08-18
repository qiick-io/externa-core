<?php

namespace App\Console\Commands;

use App\Models\CollectionItemChatAttachment;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('chat:cleanup-attachments')]
#[Description('Remove expired unattached chat uploads and their temporary files')]
/**
 * Purge orphan chat attachments past TTL (message never posted).
 */
class CleanupChatAttachmentsCommand extends Command
{
    /**
     * Delete expired orphan attachment records and their storage files.
     */
    public function handle(): int
    {
        $expired = CollectionItemChatAttachment::query()
            ->whereNull('message_id')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->get();

        $cleanedCount = 0;

        foreach ($expired as $attachment) {
            $attachment->delete();
            $cleanedCount++;
        }

        $this->info(sprintf('Cleaned up %d expired chat attachment(s).', $cleanedCount));

        return self::SUCCESS;
    }
}
