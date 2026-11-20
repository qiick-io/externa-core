<?php

/**
 * Console commands and scheduled maintenance tasks.
 *
 * Schedules clean up activity logs, stale uploads/zips, AI attachments, sync sources,
 * and collection item revisions past retention limits, and warn about expiring API keys.
 */

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('activitylog:clean')->daily();
Schedule::command('files:cleanup-uploads')->hourly();
Schedule::command('files:cleanup-zips')->hourly();
Schedule::command('ai:cleanup-attachments')->daily();
Schedule::command('ai:prune-tool-audit')->daily();
Schedule::command('chat:cleanup-attachments')->daily();
Schedule::command('ai:run-sync-sources')->everyMinute()->withoutOverlapping()->onOneServer();
Schedule::command('collections:process-schedules')->everyMinute()->withoutOverlapping()->onOneServer();
Schedule::command('collections:prune-revisions')->daily();
Schedule::command('api-keys:notify-expiring')->daily()->onOneServer();
Schedule::command('mcp:prune-unused-oauth-clients')->daily()->onOneServer();
