<?php

namespace App\Services\Collections;

use App\Models\CollectionField;

/**
 * Evaluate per-field form conditions (operators + AND/OR).
 *
 * Show-when: conditions.hidden === false means visible only while rules match.
 *
 * ponytail: flat rules + top-level and/or only — nested groups / expression AST if product needs trees.
 */
class FieldConditionEvaluator
{
    /**
     * @var list<string>
     */
    public const OPERATORS = [
        'equals',
        'not_equals',
        'empty',
        'not_empty',
        'contains',
        'gt',
        'gte',
        'lt',
        'lte',
        'in',
        'not_in',
    ];

    /**
     * @param  array<string, mixed>  $data  Item `data` payload keyed by field name
     * @return array{hidden: bool, readonly: bool, required: bool}
     */
    public function effectiveFlags(CollectionField $field, array $data): array
    {
        $requiredFromValidation = false;
        $rawRules = data_get($field->settings, 'validation_rules', []);
        if (is_array($rawRules)) {
            foreach ($rawRules as $rule) {
                if (is_array($rule) && ($rule['operator'] ?? null) === 'required') {
                    $requiredFromValidation = true;
                    break;
                }
            }
        }

        $flags = [
            'hidden' => $field->isHiddenInForm(),
            'readonly' => $field->isReadonly(),
            'required' => $field->isRequired() || $requiredFromValidation,
        ];

        $conditions = data_get($field->settings, 'conditions');
        if (! is_array($conditions)) {
            return $flags;
        }

        $rules = data_get($conditions, 'rules', []);
        if (! is_array($rules) || $rules === []) {
            return $flags;
        }

        $logic = strtolower((string) data_get($conditions, 'logic', 'and'));
        if ($logic !== 'or') {
            $logic = 'and';
        }

        if (! $this->rulesMatch($rules, $data, $logic)) {
            // Show-when: explicit hidden=false means visible only while rules match.
            if (array_key_exists('hidden', $conditions)
                && ! CollectionField::settingsFlagIsEnabled($conditions['hidden'])) {
                $flags['hidden'] = true;
            }

            return $flags;
        }

        foreach (['hidden', 'readonly', 'required'] as $key) {
            if (array_key_exists($key, $conditions)) {
                $flags[$key] = CollectionField::settingsFlagIsEnabled($conditions[$key]);
            }
        }

        return $flags;
    }

    /**
     * @param  list<mixed>  $rules
     * @param  array<string, mixed>  $data
     */
    public function rulesMatch(array $rules, array $data, string $logic = 'and'): bool
    {
        if ($rules === []) {
            return true;
        }

        $logic = strtolower($logic) === 'or' ? 'or' : 'and';

        if ($logic === 'or') {
            foreach ($rules as $rule) {
                if (is_array($rule) && $this->singleRuleMatches($rule, $data)) {
                    return true;
                }
            }

            return false;
        }

        foreach ($rules as $rule) {
            if (! is_array($rule)) {
                return false;
            }

            if (! $this->singleRuleMatches($rule, $data)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $rule
     * @param  array<string, mixed>  $data
     */
    private function singleRuleMatches(array $rule, array $data): bool
    {
        $fieldName = data_get($rule, 'field');
        if (! is_string($fieldName) || $fieldName === '') {
            return false;
        }

        $operator = (string) data_get($rule, 'operator', 'equals');
        $expected = data_get($rule, 'value');
        $actual = $data[$fieldName] ?? null;

        return match ($operator) {
            'empty' => $this->isEmpty($actual),
            'not_empty' => ! $this->isEmpty($actual),
            'not_equals' => ! $this->valuesEqual($actual, $expected),
            'contains' => $this->contains($actual, $expected),
            'gt', 'gte', 'lt', 'lte' => $this->compareOrdered($actual, $expected, $operator),
            'in' => $this->inList($actual, $expected),
            'not_in' => ! $this->inList($actual, $expected),
            default => $this->valuesEqual($actual, $expected),
        };
    }

    private function isEmpty(mixed $value): bool
    {
        if ($value === null) {
            return true;
        }

        if (is_string($value)) {
            return trim($value) === '';
        }

        if (is_array($value)) {
            return $value === [];
        }

        return false;
    }

    private function valuesEqual(mixed $actual, mixed $expected): bool
    {
        if (is_array($actual)) {
            // ponytail: multi-value fields compare as "contains expected string"
            if (is_string($expected) || is_numeric($expected)) {
                return in_array((string) $expected, array_map('strval', $actual), true);
            }

            return false;
        }

        if ($actual === null) {
            return $expected === null || $expected === '';
        }

        $actualBool = $this->asLooseBoolean($actual);
        $expectedBool = $this->asLooseBoolean($expected);

        if ($actualBool !== null && $expectedBool !== null) {
            return $actualBool === $expectedBool;
        }

        return (string) $actual === (string) $expected;
    }

    private function asLooseBoolean(mixed $value): ?bool
    {
        if ($value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on') {
            return true;
        }

        if ($value === false || $value === 0 || $value === '0' || $value === 'false' || $value === 'off') {
            return false;
        }

        return null;
    }

    private function contains(mixed $actual, mixed $expected): bool
    {
        if ($expected === null || $expected === '') {
            return false;
        }

        if (is_array($actual)) {
            return in_array((string) $expected, array_map('strval', $actual), true);
        }

        if ($actual === null) {
            return false;
        }

        return str_contains((string) $actual, (string) $expected);
    }

    /**
     * @param  'gt'|'gte'|'lt'|'lte'  $operator
     */
    private function compareOrdered(mixed $actual, mixed $expected, string $operator): bool
    {
        if ($this->isEmpty($actual) || $expected === null || $expected === '') {
            return false;
        }

        $left = $this->toComparable($actual);
        $right = $this->toComparable($expected);

        if ($left === null || $right === null) {
            return false;
        }

        // Mixed numeric vs string date: fall back to string compare of originals.
        if (is_float($left) !== is_float($right)) {
            $left = (string) $actual;
            $right = (string) $expected;
        }

        return match ($operator) {
            'gt' => $left > $right,
            'gte' => $left >= $right,
            'lt' => $left < $right,
            'lte' => $left <= $right,
        };
    }

    /**
     * @return float|string|null float for numbers; string for date-like / fallback
     */
    private function toComparable(mixed $value): float|string|null
    {
        if (is_bool($value)) {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        if ($trimmed === '') {
            return null;
        }

        if (is_numeric($trimmed)) {
            return (float) $trimmed;
        }

        // ISO date / datetime prefixes sort lexicographically for gt/lt.
        if (preg_match('/^\d{4}-\d{2}-\d{2}/', $trimmed) === 1) {
            return $trimmed;
        }

        return $trimmed;
    }

    private function inList(mixed $actual, mixed $expected): bool
    {
        $haystack = $this->normalizeList($expected);

        if ($haystack === []) {
            return false;
        }

        if (is_array($actual)) {
            foreach ($actual as $item) {
                if (in_array((string) $item, $haystack, true)) {
                    return true;
                }
            }

            return false;
        }

        if ($actual === null) {
            return false;
        }

        return in_array((string) $actual, $haystack, true);
    }

    /**
     * @return list<string>
     */
    private function normalizeList(mixed $expected): array
    {
        if (is_array($expected)) {
            return array_values(array_map('strval', $expected));
        }

        if ($expected === null || $expected === '') {
            return [];
        }

        $parts = preg_split('/\s*,\s*/', (string) $expected) ?: [];

        return array_values(array_filter($parts, static fn (string $part): bool => $part !== ''));
    }

    /**
     * Drop incoming keys that are effectively readonly (static settings + conditions).
     *
     * @param  iterable<CollectionField>  $fields
     * @param  array<string, mixed>  $previewData  Assembled base merged with attempted write
     * @param  array<string, mixed>  $incoming
     * @return array<string, mixed>
     */
    public function withoutReadonlyFields(iterable $fields, array $previewData, array $incoming): array
    {
        foreach ($fields as $field) {
            if ($this->effectiveFlags($field, $previewData)['readonly']) {
                unset($incoming[$field->name]);
            }
        }

        return $incoming;
    }

    /**
     * @param  array<string, mixed>|null  $conditions
     * @return array{logic: string, rules: list<array{field: string, operator: string, value?: mixed}>, hidden?: bool, readonly?: bool, required?: bool}|null
     */
    public function normalizeSettings(?array $conditions): ?array
    {
        if ($conditions === null || $conditions === []) {
            return null;
        }

        $rules = [];
        $rawRules = data_get($conditions, 'rules', []);
        if (! is_array($rawRules)) {
            return null;
        }

        foreach ($rawRules as $rawRule) {
            if (! is_array($rawRule)) {
                continue;
            }

            $field = data_get($rawRule, 'field');
            if (! is_string($field) || trim($field) === '') {
                continue;
            }

            $operator = (string) data_get($rawRule, 'operator', 'equals');
            if (! in_array($operator, self::OPERATORS, true)) {
                $operator = 'equals';
            }

            $entry = [
                'field' => trim($field),
                'operator' => $operator,
            ];

            if (! in_array($operator, ['empty', 'not_empty'], true)) {
                $value = data_get($rawRule, 'value');
                if (in_array($operator, ['in', 'not_in'], true)) {
                    $entry['value'] = $this->normalizeListValueForStorage($value);
                } else {
                    $entry['value'] = $value;
                }
            }

            $rules[] = $entry;
        }

        if ($rules === []) {
            return null;
        }

        $logic = strtolower((string) data_get($conditions, 'logic', 'and'));
        $normalized = [
            'logic' => $logic === 'or' ? 'or' : 'and',
            'rules' => $rules,
        ];

        foreach (['hidden', 'readonly', 'required'] as $key) {
            if (array_key_exists($key, $conditions)) {
                $normalized[$key] = CollectionField::settingsFlagIsEnabled($conditions[$key]);
            }
        }

        return $normalized;
    }

    /**
     * Store in/not_in as comma-separated string (UI-friendly) when array given.
     */
    private function normalizeListValueForStorage(mixed $value): mixed
    {
        if (is_array($value)) {
            return implode(', ', array_map('strval', $value));
        }

        return $value;
    }
}
