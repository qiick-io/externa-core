<?php

namespace App\Http\Middleware;

use App\Services\Settings\ProjectSettings;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolve the active UI locale from the user, cookie, or app default.
 */
class SetLocale
{
    /**
     * Set App locale for the request (UI + Laravel validation/auth messages).
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        App::setLocale($this->resolve($request));

        return $next($request);
    }

    /**
     * Preference order: authenticated user → cookie → project default → config default.
     */
    private function resolve(Request $request): string
    {
        $available = array_keys(config('i18n.available_locales', ['en' => 'English']));

        $userLocale = $request->user()?->locale;
        if (is_string($userLocale) && in_array($userLocale, $available, true)) {
            return $userLocale;
        }

        $cookieLocale = $request->cookie('locale');
        if (is_string($cookieLocale) && in_array($cookieLocale, $available, true)) {
            return $cookieLocale;
        }

        $projectLocale = app(ProjectSettings::class)->defaultLanguage();
        if (in_array($projectLocale, $available, true)) {
            return $projectLocale;
        }

        $fallback = (string) config('app.locale', 'en');

        return in_array($fallback, $available, true) ? $fallback : 'en';
    }
}
