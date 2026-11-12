<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Services\Uploads\UploadSizeLimiterService;
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
            'files_max_upload_bytes' => ['nullable', 'integer', 'min:1', 'max:'.UploadSizeLimiterService::SETTING_MAX_BYTES],
            'chat_max_upload_bytes' => ['nullable', 'integer', 'min:1', 'max:'.UploadSizeLimiterService::SETTING_MAX_BYTES],
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
            'upload_allowed_mimes' => ['nullable', 'array'],
            'upload_allowed_mimes.*' => ['string', 'max:128'],
            'upload_allowed_extensions' => ['nullable', 'array'],
            'upload_allowed_extensions.*' => ['string', 'max:32'],
            'upload_allow_svg' => ['sometimes', 'boolean'],
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

        $mimes = isset($validated['upload_allowed_mimes']) && is_array($validated['upload_allowed_mimes'])
            ? array_values(array_filter(array_map(
                static fn (mixed $mime): string => strtolower(trim((string) $mime)),
                $validated['upload_allowed_mimes'],
            )))
            : null;

        $extensions = isset($validated['upload_allowed_extensions']) && is_array($validated['upload_allowed_extensions'])
            ? array_values(array_filter(array_map(
                static function (mixed $ext): string {
                    $normalized = strtolower(trim((string) $ext));

                    return ltrim($normalized, '.');
                },
                $validated['upload_allowed_extensions'],
            )))
            : null;

        return [
            'files_max_upload_bytes' => isset($validated['files_max_upload_bytes'])
                ? (int) $validated['files_max_upload_bytes']
                : null,
            'chat_max_upload_bytes' => isset($validated['chat_max_upload_bytes'])
                ? (int) $validated['chat_max_upload_bytes']
                : null,
            'allowed_transformations' => array_values($validated['allowed_transformations'] ?? []),
            'preset_transformations' => $presets,
            'upload_allowed_mimes' => $mimes === [] ? null : $mimes,
            'upload_allowed_extensions' => $extensions === [] ? null : $extensions,
            'upload_allow_svg' => (bool) ($validated['upload_allow_svg'] ?? false),
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

        foreach (['upload_allowed_mimes', 'upload_allowed_extensions'] as $listField) {
            if (! $this->has($listField)) {
                continue;
            }
            $raw = $this->input($listField);
            if (is_string($raw)) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    $merge[$listField] = $decoded;
                } else {
                    $parts = preg_split('/[\s,]+/', $raw) ?: [];
                    $merge[$listField] = array_values(array_filter(array_map('trim', $parts)));
                }
            } elseif ($raw === null || (is_array($raw) && $raw === [])) {
                $merge[$listField] = null;
            }
        }

        if ($this->has('upload_allow_svg')) {
            $merge['upload_allow_svg'] = $this->boolean('upload_allow_svg');
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
