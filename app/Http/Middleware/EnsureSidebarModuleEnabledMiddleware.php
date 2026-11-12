<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Settings\Project\ProjectGeneralSettingsService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Abort with 403 when a project sidebar module is disabled.
 */
class EnsureSidebarModuleEnabledMiddleware
{
    public function __construct(
        private readonly ProjectGeneralSettingsService $generalSettings,
    ) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $moduleId): Response
    {
        if (! $this->generalSettings->isSidebarModuleEnabled($moduleId)) {
            abort(403);
        }

        return $next($request);
    }
}
