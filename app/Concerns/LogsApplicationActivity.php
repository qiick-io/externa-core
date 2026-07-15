<?php

namespace App\Concerns;

use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

trait LogsApplicationActivity
{
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        return $this->applicationActivityLogOptions();
    }

    protected function applicationActivityLogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logAll()
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName('default');
    }
}
