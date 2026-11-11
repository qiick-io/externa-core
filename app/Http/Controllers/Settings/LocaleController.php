<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateLocaleRequest;
use Illuminate\Http\RedirectResponse;

/**
 * Persists the authenticated user's UI locale preference.
 */
class LocaleController extends Controller
{
    /**
     * Update locale on the user record and mirror it in a cookie.
     */
    public function update(UpdateLocaleRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $locale = $validated['locale'];

        $request->user()->forceFill(['locale' => $locale])->save();

        return back()->cookie('locale', $locale, 60 * 24 * 365);
    }
}
