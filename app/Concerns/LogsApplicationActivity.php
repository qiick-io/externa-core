<?php

namespace App\Concerns;

use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Default Spatie activity log configuration for application models.
 */
trait LogsApplicationActivity
{
    use LogsActivity;

    /**
     * Configure Spatie activity-log options for the using model.

     *

     * @return \Spatie\Activitylog\LogOptions
     */
    public function getActivitylogOptions(): LogOptions
    {
        return $this->applicationActivityLogOptions();
    }

    /**
     * Default activity log options for models using this trait.
     */
    protected function applicationActivityLogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logAll()
            ->logOnlyDirty()
            ->dontLogEmptyChanges()
            ->useLogName('default');
    }
}
