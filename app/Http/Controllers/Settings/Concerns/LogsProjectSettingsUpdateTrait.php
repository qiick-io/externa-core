<?php

namespace App\Http\Controllers\Settings\Concerns;

use App\Services\Settings\SettingsRepository;
use Illuminate\Http\Request;

/**
 * Shared activity-log writer for project settings section updates.
 */
trait LogsProjectSettingsUpdateTrait
{
    /**
     * @param  array<string, mixed>  $values
     * @param  list<string>  $secretKeys
     */
    protected function logProjectSettingsUpdate(
        Request $request,
        string $section,
        array $values,
        array $secretKeys = [],
    ): void {
        $keys = array_keys($values);

        activity()
            ->causedBy($request->user())
            ->useLog('settings')
            ->event('settings_updated')
            ->withProperties([
                'scope' => SettingsRepository::SCOPE_PROJECT,
                'group' => 'project',
                'section' => $section,
                'keys' => $keys,
                'secret_keys_updated' => $secretKeys !== []
                    && count(array_intersect($keys, $secretKeys)) > 0,
            ])
            ->log('Project settings updated');
    }
}
