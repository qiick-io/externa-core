<?php

namespace App\Services\Collections;

use App\Models\CollectionField;

/**
 * Evaluate simple per-field form conditions (equals / not_equals / empty / not_empty + AND).
 *
 * ponytail: AND-only, no nested groups / OR / comparisons beyond equality — upgrade path is a
 * small expression AST if product needs Directus-style rule trees.
 */
class FieldConditionEvaluator
{
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

        if (! $this->rulesMatch($rules, $data)) {
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
    public function rulesMatch(array $rules, array $data): bool
    {
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

        return (string) $actual === (string) $expected;
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
            if (! in_array($operator, ['equals', 'not_equals', 'empty', 'not_empty'], true)) {
                $operator = 'equals';
            }

            $entry = [
                'field' => trim($field),
                'operator' => $operator,
            ];

            if (! in_array($operator, ['empty', 'not_empty'], true)) {
                $entry['value'] = data_get($rawRule, 'value');
            }

            $rules[] = $entry;
        }

        if ($rules === []) {
            return null;
        }

        $normalized = [
            'logic' => 'and',
            'rules' => $rules,
        ];

        foreach (['hidden', 'readonly', 'required'] as $key) {
            if (array_key_exists($key, $conditions)) {
                $normalized[$key] = CollectionField::settingsFlagIsEnabled($conditions[$key]);
            }
        }

        return $normalized;
    }
}
