<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateNotificationPreferencesRequest;
use App\Services\Settings\UserNotificationPreferences;
use Illuminate\Http\RedirectResponse;

/**
 * Persists user notification sound preferences.
 */
class NotificationPreferencesController extends Controller
{
    public function __construct(
        private readonly UserNotificationPreferences $preferences,
    ) {}

    /**
     * Save chat and notification sound toggles.
     */
    public function update(UpdateNotificationPreferencesRequest $request): RedirectResponse
    {
        $user = $request->user();
        abort_if($user === null, 403);

        $this->preferences->update($user, $request->preferenceValues());

        return to_route('profile.edit');
    }
}
