<?php

namespace App\Http\Requests\Settings;

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\ThemePresetEnum;
use App\Models\File;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Validate project branding / default appearance updates.
 */
class UpdateAppearanceSettingsRequest extends FormRequest
{
    /**
     * Authorize users who can manage project settings.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null
            && app(EffectivePermissionResolverService::class)
                ->hasPermission($user, PermissionEnum::CanManageProjectSettings->value);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'theme_preset' => ['required', 'string', Rule::in(ThemePresetEnum::values())],
            'project_color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'project_color_dark' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'project_logo_id' => ['nullable', 'integer', 'exists:files,id'],
            'project_logo_dark_id' => ['nullable', 'integer', 'exists:files,id'],
            'public_favicon_id' => ['nullable', 'integer', 'exists:files,id'],
            'default_appearance' => ['required', 'string', Rule::in(['system', 'light', 'dark'])],
        ];
    }

    /**
     * Normalize empty strings to null and ensure file ids point at files (not folders).
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach ([
                'project_logo_id',
                'project_logo_dark_id',
                'public_favicon_id',
            ] as $field) {
                $id = $this->input($field);

                if ($id === null || $id === '') {
                    continue;
                }

                $file = File::query()->find($id);

                if ($file === null || $file->type !== FileTypeEnum::File) {
                    $validator->errors()->add($field, 'The selected file is invalid.');
                }
            }
        });
    }

    /**
     * @return array{
     *     theme_preset: string,
     *     project_color: string|null,
     *     project_color_dark: string|null,
     *     project_logo: int|null,
     *     project_logo_dark: int|null,
     *     public_favicon: int|null,
     *     default_appearance: string
     * }
     */
    public function appearanceValues(): array
    {
        $validated = $this->validated();

        return [
            'theme_preset' => $validated['theme_preset'],
            'project_color' => $validated['project_color'] ?? null,
            'project_color_dark' => $validated['project_color_dark'] ?? null,
            'project_logo' => isset($validated['project_logo_id']) ? (int) $validated['project_logo_id'] : null,
            'project_logo_dark' => isset($validated['project_logo_dark_id']) ? (int) $validated['project_logo_dark_id'] : null,
            'public_favicon' => isset($validated['public_favicon_id']) ? (int) $validated['public_favicon_id'] : null,
            'default_appearance' => $validated['default_appearance'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $nullable = [
            'project_color',
            'project_color_dark',
            'project_logo_id',
            'project_logo_dark_id',
            'public_favicon_id',
        ];

        $merge = [];

        foreach ($nullable as $field) {
            if ($this->has($field) && $this->input($field) === '') {
                $merge[$field] = null;
            }
        }

        if (! $this->filled('theme_preset')) {
            $merge['theme_preset'] = $this->storedThemePreset();
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }

    /**
     * Preset to keep when the request omits `theme_preset`: the stored one,
     * or the default only when nothing valid has been saved yet.
     */
    private function storedThemePreset(): string
    {
        $storedThemePreset = app(SettingsRepositoryService::class)->get(
            SettingsRepositoryService::SCOPE_PROJECT,
            'appearance',
            'theme_preset',
        );

        return ThemePresetEnum::tryFromNullable(
            is_string($storedThemePreset) ? $storedThemePreset : null,
        )->value;
    }
}
