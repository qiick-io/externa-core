<?php

namespace App\Http\Middleware;

use App\Services\Settings\ProjectSettings;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Abort with 403 when a project sidebar module is disabled.
 */
class EnsureSidebarModuleEnabled
{
    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $moduleId): Response
    {
        if (! $this->projectSettings->isSidebarModuleEnabled($moduleId)) {
            abort(403);
        }

        return $next($request);
    }
}
