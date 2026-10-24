<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Support\Collections\ContentLocaleCatalog;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate localization project settings (admin UI language + content locales).
 */
class UpdateProjectLocalizationSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $locales = array_keys(config('i18n.available_locales', ['en' => 'English']));
        $contentCatalog = ContentLocaleCatalog::codes();

        return [
            'default_language' => ['required', 'string', Rule::in($locales)],
            'content_locales' => ['required', 'array', 'min:1'],
            'content_locales.*' => ['required', 'string', 'distinct', Rule::in($contentCatalog)],
            'default_content_locale' => ['required', 'string'],
            'fallback_content_locales' => ['nullable', 'array'],
            'fallback_content_locales.*' => ['string'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $contentLocales = $this->input('content_locales', []);
            if (! is_array($contentLocales)) {
                return;
            }

            $default = $this->input('default_content_locale');
            if (is_string($default) && $default !== '' && ! in_array($default, $contentLocales, true)) {
                $validator->errors()->add(
                    'default_content_locale',
                    'The default content locale must be one of the selected content locales.',
                );
            }

            $fallbacks = $this->input('fallback_content_locales', []);
            if (! is_array($fallbacks)) {
                return;
            }

            foreach ($fallbacks as $index => $locale) {
                if (is_string($locale) && $locale !== '' && ! in_array($locale, $contentLocales, true)) {
                    $validator->errors()->add(
                        "fallback_content_locales.{$index}",
                        'Fallback locales must be selected content locales.',
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

        return [
            'default_language' => $validated['default_language'],
            'content_locales' => array_values($validated['content_locales']),
            'default_content_locale' => $validated['default_content_locale'],
            'fallback_content_locales' => array_values($validated['fallback_content_locales'] ?? []),
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        if ($this->has('content_locales') && is_string($this->input('content_locales'))) {
            $decoded = json_decode((string) $this->input('content_locales'), true);
            if (is_array($decoded)) {
                $merge['content_locales'] = $decoded;
            }
        }

        if ($this->has('fallback_content_locales') && is_string($this->input('fallback_content_locales'))) {
            $decoded = json_decode((string) $this->input('fallback_content_locales'), true);
            if (is_array($decoded)) {
                $merge['fallback_content_locales'] = $decoded;
            }
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
