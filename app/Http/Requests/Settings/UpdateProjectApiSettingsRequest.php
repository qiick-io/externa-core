<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Support\Api\PublicApiOrigin;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate public API project settings (CORS allowed origins).
 */
class UpdateProjectApiSettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'public_api_allowed_origins' => ['nullable', 'array'],
            'public_api_allowed_origins.*' => [
                'string',
                'max:2048',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || ! PublicApiOrigin::isValid($value)) {
                        $fail('Each public API origin must be an http(s) origin URL with no path (e.g. https://www.example.com).');
                    }
                },
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();

        $origins = collect($validated['public_api_allowed_origins'] ?? [])
            ->map(fn (string $origin): ?string => PublicApiOrigin::normalize($origin))
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'public_api_allowed_origins' => $origins,
        ];
    }

    protected function prepareForValidation(): void
    {
        if (! $this->has('public_api_allowed_origins') || ! is_string($this->input('public_api_allowed_origins'))) {
            return;
        }

        $this->merge([
            'public_api_allowed_origins' => collect(
                preg_split('/[\s,]+/', (string) $this->input('public_api_allowed_origins')) ?: [],
            )
                ->map(fn (string $origin): string => trim($origin))
                ->filter()
                ->values()
                ->all(),
        ]);
    }
}
