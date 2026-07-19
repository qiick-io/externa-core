<?php

namespace App\Services\Collections;

use App\Models\CollectionField;
use App\Models\CollectionItemValue;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;
use Illuminate\Translation\PotentiallyTranslatedString;

/**
 * Maps field settings validation_rules to Laravel rule objects and custom rules.
 */
class FieldValidationRuleEvaluator
{
    /**
     * @return list<string|ValidationRule>
     */
    public function rulesForField(
        CollectionField $field,
        string $attributePrefix,
        ?int $excludeItemId = null,
    ): array {
        $rules = [];
        $rawRules = data_get($field->settings, 'validation_rules', []);

        if (! is_array($rawRules)) {
            return $rules;
        }

        foreach ($rawRules as $rawRule) {
            if (! is_array($rawRule)) {
                continue;
            }

            $operator = (string) ($rawRule['operator'] ?? '');
            $value = $rawRule['value'] ?? null;

            $rules = array_merge(
                $rules,
                $this->rulesForOperator($field, $operator, $value, $excludeItemId)
            );
        }

        return $rules;
    }

    /**
     * @return list<string|ValidationRule>
     */
    private function rulesForOperator(
        CollectionField $field,
        string $operator,
        mixed $value,
        ?int $excludeItemId,
    ): array {
        return match ($operator) {
            'required' => ['required'],
            'unique' => [new FieldValueUniqueRule($field, $excludeItemId)],
            'min_length' => is_numeric($value) ? ['min:'.(int) $value] : [],
            'max_length' => is_numeric($value) ? ['max:'.(int) $value] : [],
            'min' => is_numeric($value) ? ['min:'.$value] : [],
            'max' => is_numeric($value) ? ['max:'.$value] : [],
            'regex' => is_string($value) && $value !== '' ? ['regex:'.$value] : [],
            'contains' => is_string($value) && $value !== ''
                ? [new FieldValueContainsRule($value, true)]
                : [],
            'not_contains' => is_string($value) && $value !== ''
                ? [new FieldValueContainsRule($value, false)]
                : [],
            'equals' => $value !== null && $value !== ''
                ? ['in:'.(is_scalar($value) ? (string) $value : '')]
                : [],
            'not_equals' => $value !== null && $value !== ''
                ? [new FieldValueNotEqualsRule($value)]
                : [],
            default => [],
        };
    }

    /**
     * Localized custom validation message from field settings, if configured.
     */
    public function customMessage(CollectionField $field): ?string
    {
        $message = data_get($field->settings, 'validation_message');

        if (! is_array($message)) {
            return null;
        }

        $locale = app()->getLocale();
        $fallbacks = config('collections.fallback_locales', ['en', 'it']);

        if (is_string($message[$locale] ?? null) && trim($message[$locale]) !== '') {
            return trim($message[$locale]);
        }

        if (is_array($fallbacks)) {
            foreach ($fallbacks as $fallbackLocale) {
                if (
                    is_string($fallbackLocale)
                    && is_string($message[$fallbackLocale] ?? null)
                    && trim($message[$fallbackLocale]) !== ''
                ) {
                    return trim($message[$fallbackLocale]);
                }
            }
        }

        return null;
    }
}

/**
 * Ensures a field value is unique among rows for the same field_id.
 */
class FieldValueUniqueRule implements ValidationRule
{
    public function __construct(
        private CollectionField $field,
        private ?int $excludeItemId = null,
    ) {}

    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        $query = CollectionItemValue::query()->where('field_id', $this->field->id);

        if ($this->excludeItemId !== null) {
            $query->where('item_id', '!=', $this->excludeItemId);
        }

        if (DB::connection()->getDriverName() === 'pgsql') {
            $encodedValue = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if ($query->whereRaw('value::text = ?', [$encodedValue])->exists()) {
                $fail(__('The :attribute has already been taken.'));
            }

            return;
        }

        $exists = $query->get()->contains(
            static fn (CollectionItemValue $row): bool => $row->value === $value
        );

        if ($exists) {
            $fail(__('The :attribute has already been taken.'));
        }
    }
}

/**
 * Validates that a string field value contains or excludes a needle substring.
 */
class FieldValueContainsRule implements ValidationRule
{
    public function __construct(
        private string $needle,
        private bool $shouldContain,
    ) {}

    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            if ($this->shouldContain) {
                $fail(__('The :attribute must contain :value.', ['value' => $this->needle]));
            }

            return;
        }

        $contains = str_contains($value, $this->needle);

        if ($this->shouldContain && ! $contains) {
            $fail(__('The :attribute must contain :value.', ['value' => $this->needle]));

            return;
        }

        if (! $this->shouldContain && $contains) {
            $fail(__('The :attribute must not contain :value.', ['value' => $this->needle]));
        }
    }
}

/**
 * Rejects values equal to a forbidden scalar.
 */
class FieldValueNotEqualsRule implements ValidationRule
{
    public function __construct(private mixed $forbiddenValue) {}

    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ((string) $value === (string) $this->forbiddenValue) {
            $fail(__('The selected :attribute is invalid.'));
        }
    }
}
