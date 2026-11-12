<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;

/**
 * Reads the General project settings (name) and the sidebar module switches.
 *
 * `sidebar_modules` is edited on Appearance → Sidebar but stored in the same
 * `project` group, so its runtime check lives here with the other general reads.
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 */
class ProjectGeneralSettingsService
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    public function projectName(): ?string
    {
        $name = $this->projectSettings->raw()['name'] ?? null;

        return is_string($name) && trim($name) !== '' ? trim($name) : null;
    }

    public function displayName(): string
    {
        return $this->projectName() ?? (string) config('app.name');
    }

    /**
     * Whether a sidebar module is enabled in project settings.
     */
    public function isSidebarModuleEnabled(string $moduleId): bool
    {
        foreach ($this->projectSettings->raw()['sidebar_modules'] as $module) {
            if (($module['id'] ?? null) === $moduleId) {
                return (bool) ($module['enabled'] ?? false);
            }
        }

        return false;
    }
}
