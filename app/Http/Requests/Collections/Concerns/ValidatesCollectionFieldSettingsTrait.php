<?php

namespace App\Http\Requests\Collections\Concerns;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldGroupService;
use App\Traits\NormalizesCollectionFieldSettingsTrait;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

/**
 * Request-bound validation for collection field settings payloads (rules and normalization live in
 * NormalizesCollectionFieldSettingsTrait).
 *
 * @phpstan-require-extends FormRequest
 */
trait ValidatesCollectionFieldSettingsTrait
{
    use NormalizesCollectionFieldSettingsTrait;

    /**
     * After base rules pass: force group width + validate nesting parent.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $type = $this->resolveFieldTypeForTranslatable();
            $settings = $this->input('settings');
            if (! is_array($settings)) {
                $settings = null;
            }

            $groupService = app(CollectionFieldGroupService::class);

            if ($type !== null && is_array($settings)) {
                $settings = $groupService->forceFullWidthForGroup($type, $settings);
                $this->merge(['settings' => $settings]);
            }

            $collection = $this->route('collection');
            if (! $collection instanceof Collection) {
                return;
            }

            $field = $this->route('field');
            $fieldModel = $field instanceof CollectionField ? $field : null;

            try {
                $groupService->assertValidGroupParent(
                    $collection,
                    is_array($this->input('settings')) ? $this->input('settings') : null,
                    $fieldModel,
                    $type,
                );
            } catch (ValidationException $e) {
                foreach ($e->errors() as $key => $messages) {
                    foreach ($messages as $message) {
                        $validator->errors()->add($key, $message);
                    }
                }
            }
        });
    }

    /**
     * Force translatable=false for hash / relation types (UI hides the toggle).
     */
    protected function coerceDisallowedTranslatable(): void
    {
        $type = $this->resolveFieldTypeForTranslatable();

        if ($type !== null && ! $type->isTranslatableSupported()) {
            $this->merge(['translatable' => false]);
        }
    }

    protected function resolveFieldTypeForTranslatable(): ?FieldTypeEnum
    {
        $raw = $this->input('type');

        if (is_string($raw) && $raw !== '') {
            return FieldTypeEnum::tryFrom($raw);
        }

        if ($raw instanceof FieldTypeEnum) {
            return $raw;
        }

        $field = $this->route('field');

        if ($field instanceof CollectionField) {
            return $field->type instanceof FieldTypeEnum ? $field->type : null;
        }

        return null;
    }
}
