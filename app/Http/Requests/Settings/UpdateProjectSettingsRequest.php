<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate general project settings updates (identity + reporting links).
 */
class UpdateProjectSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'url' => ['nullable', 'url', 'max:2048'],
            'report_issue_url' => ['nullable', 'url', 'max:2048'],
            'report_bug_url' => ['nullable', 'url', 'max:2048'],
            'report_error_url' => ['nullable', 'url', 'max:2048'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();

        return [
            'name' => $validated['name'] ?? null,
            'description' => $validated['description'] ?? null,
            'url' => $validated['url'] ?? null,
            'report_issue_url' => $validated['report_issue_url'] ?? null,
            'report_bug_url' => $validated['report_bug_url'] ?? null,
            'report_error_url' => $validated['report_error_url'] ?? null,
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        foreach ([
            'name',
            'description',
            'url',
            'report_issue_url',
            'report_bug_url',
            'report_error_url',
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
