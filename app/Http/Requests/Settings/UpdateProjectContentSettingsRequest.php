<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate content project settings (revision retention + live preview URL).
 */
class UpdateProjectContentSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Template may include {{id}} etc. — not a strict Laravel url
            'preview_url_default' => ['nullable', 'string', 'max:2048', 'regex:/^https?:\/\/.+/i'],
            'revision_retention_count' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'revision_retention_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();

        return [
            'preview_url_default' => $validated['preview_url_default'] ?? null,
            'revision_retention_count' => isset($validated['revision_retention_count'])
                ? (int) $validated['revision_retention_count']
                : null,
            'revision_retention_days' => isset($validated['revision_retention_days'])
                ? (int) $validated['revision_retention_days']
                : null,
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        foreach ([
            'preview_url_default',
            'revision_retention_count',
            'revision_retention_days',
        ] as $field) {
            if ($this->has($field) && $this->input($field) === '') {
                $merge[$field] = null;
            }
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
