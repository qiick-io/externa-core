<?php

namespace App\Notifications\Concerns;

use Illuminate\Notifications\Messages\BroadcastMessage;

/**
 * Deliver via database always; also broadcast when a real-time driver is configured.
 */
trait BroadcastsWithDatabase
{
    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $channels = ['database'];

        // ponytail: skip broadcast on log/null — Echo is off and logging every notify is noise
        if ($this->shouldBroadcastRealtime()) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        // ponytail: BroadcastNotificationCreated is ShouldBroadcast (queued). HTTP notify
        // must hit Echo without a worker. Zip jobs already have one; comments do not.
        return (new BroadcastMessage($this->toArray($notifiable)))->onConnection('sync');
    }

    protected function shouldBroadcastRealtime(): bool
    {
        $driver = (string) config('broadcasting.default');

        return ! in_array($driver, ['log', 'null', ''], true);
    }
}
