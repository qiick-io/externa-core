<?php

namespace App\Support\Collections;

use App\Enums\FieldTypeEnum;
use App\Http\Requests\Collections\Concerns\ValidatesCollectionFieldSettings;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * HTTP-equivalent normalize + validate for collection field settings (shared by FormRequests and AI tools).
 */
final class CollectionFieldSettingsPipeline
{
    use ValidatesCollectionFieldSettings;

    /**
     * Normalize then validate settings the same way Store/Update field HTTP requests do.
     *
     * @param  array<string, mixed>|null  $settings
     * @return array<string, mixed>|string Normalized settings, or English Error string on failure
     */
    public function normalizeAndValidate(?array $settings, ?FieldTypeEnum $fieldType = null): array|string
    {
        $normalized = $this->normalizeSettingsArray($settings ?? []);

        $validator = Validator::make(
            ['settings' => $normalized === [] ? null : $normalized],
            $this->fieldSettingsRules($fieldType),
        );

        try {
            $validator->validate();
        } catch (ValidationException $exception) {
            $first = $exception->validator->errors()->first();

            return 'Error: Invalid settings_json'.($first !== '' ? ': '.$first : '.');
        }

        return $normalized;
    }
}
