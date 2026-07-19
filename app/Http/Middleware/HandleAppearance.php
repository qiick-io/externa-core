<?php

namespace App\Http\Middleware;

use App\Services\Settings\ProjectAppearance;
use App\Services\Settings\ProjectSettings;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

/**
 * Share appearance / branding view vars for the Blade document shell.
 */
class HandleAppearance
{
    /**
     * Prefer the personal appearance cookie; fall back to the project default.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $projectAppearance = app(ProjectAppearance::class)->shared();
        $cookie = $request->cookie('appearance');

        View::share(
            'appearance',
            is_string($cookie) && $cookie !== ''
                ? $cookie
                : $projectAppearance['defaultAppearance'],
        );
        View::share('projectFaviconUrl', $projectAppearance['faviconUrl']);
        View::share('projectColor', $projectAppearance['projectColor']);
        View::share('projectColorForeground', $projectAppearance['primaryForeground']);
        View::share('projectName', app(ProjectSettings::class)->displayName());

        return $next($request);
    }
}
