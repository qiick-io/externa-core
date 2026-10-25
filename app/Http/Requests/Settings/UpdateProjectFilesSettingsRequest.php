<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Support\Uploads\UploadSizeLimiter;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate files & media project settings (upload limits + image transforms).
 */
class UpdateProjectFilesSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $transformations = config('settings.project.allowed_transformations', ['thumbnail']);
        $fits = config('settings.project.transform_fits', ['contain']);
        $formats = config('settings.project.transform_formats', ['auto']);

        return [
            'files_max_upload_bytes' => ['nullable', 'integer', 'min:1', 'max:'.UploadSizeLimiter::SETTING_MAX_BYTES],
            'chat_max_upload_bytes' => ['nullable', 'integer', 'min:1', 'max:'.UploadSizeLimiter::SETTING_MAX_BYTES],
            'allowed_transformations' => ['nullable', 'array'],
            'allowed_transformations.*' => ['string', Rule::in($transformations)],
            'preset_transformations' => ['required', 'array', 'min:1'],
            'preset_transformations.*.key' => ['required', 'string', 'max:64', 'distinct', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'preset_transformations.*.fit' => ['required', 'string', Rule::in($fits)],
            'preset_transformations.*.width' => ['nullable', 'integer', 'min:1', 'max:4096'],
            'preset_transformations.*.height' => ['nullable', 'integer', 'min:1', 'max:4096'],
            'preset_transformations.*.quality' => ['required', 'integer', 'min:1', 'max:100'],
            'preset_transformations.*.without_enlargement' => ['required', 'boolean'],
            'preset_transformations.*.format' => ['required', 'string', Rule::in($formats)],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            foreach ($this->input('preset_transformations', []) as $index => $preset) {
                if (! is_array($preset)) {
                    continue;
                }

                $width = $preset['width'] ?? null;
                $height = $preset['height'] ?? null;

                if (($width === null || $width === '') && ($height === null || $height === '')) {
                    $validator->errors()->add(
                        "preset_transformations.{$index}.width",
                        'At least one of width or height is required.',
                    );
                }
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();

        $presets = collect($validated['preset_transformations'])
            ->map(function (array $preset): array {
                return [
                    'key' => strtolower(trim($preset['key'])),
                    'fit' => $preset['fit'],
                    'width' => isset($preset['width']) ? (int) $preset['width'] : null,
                    'height' => isset($preset['height']) ? (int) $preset['height'] : null,
                    'quality' => (int) $preset['quality'],
                    'without_enlargement' => (bool) $preset['without_enlargement'],
                    'format' => $preset['format'],
                ];
            })
            ->values()
            ->all();

        return [
            'files_max_upload_bytes' => isset($validated['files_max_upload_bytes'])
                ? (int) $validated['files_max_upload_bytes']
                : null,
            'chat_max_upload_bytes' => isset($validated['chat_max_upload_bytes'])
                ? (int) $validated['chat_max_upload_bytes']
                : null,
            'allowed_transformations' => array_values($validated['allowed_transformations'] ?? []),
            'preset_transformations' => $presets,
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        foreach ([
            'files_max_upload_bytes',
            'chat_max_upload_bytes',
        ] as $field) {
            if ($this->has($field) && $this->input($field) === '') {
                $merge[$field] = null;
            }
        }

        if ($this->has('preset_transformations') && is_string($this->input('preset_transformations'))) {
            $decoded = json_decode((string) $this->input('preset_transformations'), true);
            if (is_array($decoded)) {
                $merge['preset_transformations'] = collect($decoded)
                    ->map(function (mixed $entry): mixed {
                        if (! is_array($entry)) {
                            return $entry;
                        }

                        if (array_key_exists('without_enlargement', $entry)) {
                            $entry['without_enlargement'] = filter_var(
                                $entry['without_enlargement'],
                                FILTER_VALIDATE_BOOLEAN,
                            );
                        }

                        foreach (['width', 'height'] as $dim) {
                            if (array_key_exists($dim, $entry) && ($entry[$dim] === '' || $entry[$dim] === null)) {
                                $entry[$dim] = null;
                            }
                        }

                        return $entry;
                    })
                    ->all();
            }
        }

        if ($this->has('allowed_transformations') && is_string($this->input('allowed_transformations'))) {
            $decoded = json_decode((string) $this->input('allowed_transformations'), true);
            if (is_array($decoded)) {
                $merge['allowed_transformations'] = $decoded;
            }
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
