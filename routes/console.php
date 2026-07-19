<?php

/**
 * Console commands and scheduled maintenance tasks.
 *
 * Schedules clean up activity logs, stale uploads/zips, AI attachments, and sync sources.
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
Schedule::command('ai:run-sync-sources')->everyMinute();
