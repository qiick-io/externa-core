<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;
use App\Traits\NormalizesProjectSettingValuesTrait;

/**
 * Reads the General project settings (name) and the sidebar module switches.
 *
 * `sidebar_modules` is edited on Appearance → Sidebar but stored in the same
 * `project` group, so its runtime check lives here with the other general reads.
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 *
 * This area's keys of the stored bag are normalized here ({@see normalize()}),
 * and {@see ProjectSettingsService::raw()} composes them with the other areas.
 */
class ProjectGeneralSettingsService
{
    use NormalizesProjectSettingValuesTrait;

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

    /**
     * Normalize the General keys (name, description, URL, report links) and the
     * sidebar modules of a stored `project` bag.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function normalize(array $raw): array
    {
        return [
            'name' => is_string($raw['name'] ?? null) && trim($raw['name']) !== ''
                ? trim($raw['name'])
                : null,
            'description' => is_string($raw['description'] ?? null) ? $raw['description'] : null,
            'url' => is_string($raw['url'] ?? null) && trim($raw['url']) !== ''
                ? trim($raw['url'])
                : null,
            'sidebar_modules' => $this->normalizeSidebarModules($raw['sidebar_modules'] ?? null),
            'report_issue_url' => $this->nullableUrl($raw['report_issue_url'] ?? null),
            'report_bug_url' => $this->nullableUrl($raw['report_bug_url'] ?? null),
            'report_error_url' => $this->nullableUrl($raw['report_error_url'] ?? null),
        ];
    }

    /**
     * @return list<array{id: string, enabled: bool, locked: bool}>
     */
    private function normalizeSidebarModules(mixed $value): array
    {
        /** @var list<array{id: string, enabled: bool, locked: bool}> $defaults */
        $defaults = config('settings.project.defaults.sidebar_modules', []);
        $known = config('settings.project.sidebar_module_ids', []);
        $lockedIds = collect($defaults)->where('locked', true)->pluck('id')->all();

        $byId = [];
        if (is_array($value)) {
            foreach ($value as $entry) {
                if (! is_array($entry) || ! is_string($entry['id'] ?? null)) {
                    continue;
                }
                if (! in_array($entry['id'], $known, true)) {
                    continue;
                }
                $byId[$entry['id']] = [
                    'id' => $entry['id'],
                    'enabled' => (bool) ($entry['enabled'] ?? true),
                    'locked' => in_array($entry['id'], $lockedIds, true),
                ];
            }
        }

        $ordered = [];
        foreach ($value ?? [] as $entry) {
            if (! is_array($entry) || ! isset($byId[$entry['id'] ?? ''])) {
                continue;
            }
            $ordered[] = $byId[$entry['id']];
            unset($byId[$entry['id']]);
        }

        foreach ($defaults as $default) {
            if (! isset($byId[$default['id']]) && ! collect($ordered)->contains('id', $default['id'])) {
                $ordered[] = [
                    'id' => $default['id'],
                    'enabled' => (bool) $default['enabled'],
                    'locked' => (bool) $default['locked'],
                ];
            } elseif (isset($byId[$default['id']])) {
                $ordered[] = $byId[$default['id']];
                unset($byId[$default['id']]);
            }
        }

        foreach ($byId as $remaining) {
            $ordered[] = $remaining;
        }

        $normalized = array_values(array_map(function (array $module) use ($lockedIds): array {
            if (in_array($module['id'], $lockedIds, true)) {
                $module['enabled'] = true;
                $module['locked'] = true;
            }

            return $module;
        }, $ordered));

        return $this->pinSidebarModules($normalized);
    }

    /**
     * Force pinned modules (e.g. AI) to the front; other order is preserved.
     *
     * @param  list<array{id: string, enabled: bool, locked: bool}>  $modules
     * @return list<array{id: string, enabled: bool, locked: bool}>
     */
    private function pinSidebarModules(array $modules): array
    {
        /** @var list<string> $pinnedIds */
        $pinnedIds = config('settings.project.sidebar_pinned_module_ids', []);
        if ($pinnedIds === []) {
            return $modules;
        }

        $byId = [];
        foreach ($modules as $module) {
            $byId[$module['id']] = $module;
        }

        $pinned = [];
        foreach ($pinnedIds as $id) {
            if (isset($byId[$id])) {
                $pinned[] = $byId[$id];
                unset($byId[$id]);
            }
        }

        $rest = [];
        foreach ($modules as $module) {
            if (isset($byId[$module['id']])) {
                $rest[] = $module;
            }
        }

        return array_values([...$pinned, ...$rest]);
    }
}
