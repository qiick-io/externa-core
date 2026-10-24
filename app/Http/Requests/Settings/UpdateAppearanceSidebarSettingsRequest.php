<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate sidebar module order / visibility (stored under project settings).
 */
class UpdateAppearanceSidebarSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $moduleIds = config('settings.project.sidebar_module_ids', []);

        return [
            'sidebar_modules' => ['required', 'array', 'min:1'],
            'sidebar_modules.*.id' => ['required', 'string', Rule::in($moduleIds)],
            'sidebar_modules.*.enabled' => ['required', 'boolean'],
            'sidebar_modules.*.locked' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();
        $defaults = config('settings.project.defaults.sidebar_modules', []);
        $lockedIds = collect($defaults)->where('locked', true)->pluck('id')->all();

        $modules = collect($validated['sidebar_modules'])
            ->map(function (array $module) use ($lockedIds): array {
                $locked = in_array($module['id'], $lockedIds, true);

                return [
                    'id' => $module['id'],
                    'enabled' => $locked ? true : (bool) $module['enabled'],
                    'locked' => $locked,
                ];
            })
            ->values()
            ->all();

        return [
            'sidebar_modules' => $this->pinSidebarModules($modules),
        ];
    }

    protected function prepareForValidation(): void
    {
        if (! $this->has('sidebar_modules') || ! is_string($this->input('sidebar_modules'))) {
            return;
        }

        $decoded = json_decode((string) $this->input('sidebar_modules'), true);
        if (is_array($decoded)) {
            $this->merge(['sidebar_modules' => $decoded]);
        }
    }

    /**
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

        return [...$pinned, ...$rest];
    }
}
