<?php

namespace App\Http\Requests\Settings;

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Services\Authorization\EffectivePermissionResolver;
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
            && app(EffectivePermissionResolver::class)
                ->hasPermission($user, PermissionEnum::CanManageProjectSettings->value);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'project_color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
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
     *     project_color: string|null,
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
            'project_color' => $validated['project_color'] ?? null,
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

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
