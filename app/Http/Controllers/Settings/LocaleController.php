<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Persists the authenticated user's UI locale preference.
 */
class LocaleController extends Controller
{
    /**
     * Update locale on the user record and mirror it in a cookie.
     */
    public function update(Request $request): RedirectResponse
    {
        $available = array_keys(config('i18n.available_locales', ['en' => 'English']));

        $validated = $request->validate([
            'locale' => ['required', 'string', Rule::in($available)],
        ]);

        $locale = $validated['locale'];

        $request->user()->forceFill(['locale' => $locale])->save();

        return back()->cookie('locale', $locale, 60 * 24 * 365);
    }
}
