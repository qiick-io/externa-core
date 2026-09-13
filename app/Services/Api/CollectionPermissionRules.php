<?php

namespace App\Services\Api;

use App\Services\Collections\FieldConditionEvaluator;

/**
 * Normalize and evaluate collection_permissions.rules (field ACL + item_filter).
 *
 * Shape:
 * {
 *   "fields": { "title": { "read": true, "create": true, "update": false } },
 *   "item_filter": { "logic": "and", "rules": [{ "field": "status", "operator": "equals", "value": "published" }] }
 * }
 *
 * Absent/empty fields map = all fields allowed. Absent/empty item_filter = all items match.
 */
class CollectionPermissionRules
{
    public function __construct(
        private FieldConditionEvaluator $conditionEvaluator,
    ) {}

    /**
     * @param  array<string, mixed>|null  $rules
     * @return array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: array{logic: string, rules: list<array{field: string, operator: string, value?: mixed}>}|null}
     */
    public function normalize(?array $rules): array
    {
        $fields = [];
        $rawFields = is_array($rules) ? ($rules['fields'] ?? null) : null;

        if (is_array($rawFields)) {
            foreach ($rawFields as $name => $flags) {
                if (! is_string($name) || trim($name) === '' || ! is_array($flags)) {
                    continue;
                }

                $fields[trim($name)] = [
                    'read' => (bool) ($flags['read'] ?? false),
                    'create' => (bool) ($flags['create'] ?? false),
                    'update' => (bool) ($flags['update'] ?? false),
                ];
            }
        }

        $itemFilter = null;
        $rawFilter = is_array($rules) ? ($rules['item_filter'] ?? null) : null;
        if (is_array($rawFilter)) {
            $itemFilter = $this->conditionEvaluator->normalizeSettings($rawFilter);
        }

        return [
            'fields' => $fields,
            'item_filter' => $itemFilter,
        ];
    }

    /**
     * @param  array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}  $normalized
     */
    public function fieldAllowed(array $normalized, string $fieldName, string $operation): bool
    {
        $fields = $normalized['fields'];

        // ponytail: empty map = unrestricted (backward compatible with null rules)
        if ($fields === []) {
            return true;
        }

        if (! isset($fields[$fieldName])) {
            return false;
        }

        return (bool) ($fields[$fieldName][$operation] ?? false);
    }

    /**
     * @param  array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}  $normalized
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function stripUnreadableFields(array $normalized, array $data): array
    {
        if ($normalized['fields'] === []) {
            return $data;
        }

        $out = [];
        foreach ($data as $key => $value) {
            if (! is_string($key)) {
                continue;
            }
            if ($this->fieldAllowed($normalized, $key, 'read')) {
                $out[$key] = $value;
            }
        }

        return $out;
    }

    /**
     * Reject write payload keys that are not writable for create|update.
     *
     * @param  array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}  $normalized
     * @param  array<string, mixed>  $data
     * @return list<string> Denied field names
     */
    public function deniedWriteFields(array $normalized, array $data, string $operation): array
    {
        if ($normalized['fields'] === [] || ! in_array($operation, ['create', 'update'], true)) {
            return [];
        }

        $denied = [];
        foreach (array_keys($data) as $key) {
            if (! is_string($key)) {
                continue;
            }
            if (! $this->fieldAllowed($normalized, $key, $operation)) {
                $denied[] = $key;
            }
        }

        return $denied;
    }

    /**
     * @param  array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}  $normalized
     * @param  array<string, mixed>  $data
     */
    public function itemMatches(array $normalized, array $data): bool
    {
        $filter = $normalized['item_filter'];
        if ($filter === null) {
            return true;
        }

        $rules = $filter['rules'] ?? [];
        if (! is_array($rules) || $rules === []) {
            return true;
        }

        return $this->conditionEvaluator->rulesMatch($rules, $data);
    }

    /**
     * Merge multiple normalized rule sets (OR across roles — most permissive).
     *
     * @param  list<array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}>  $sets
     * @return array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}|null
     *                                                                                                               null when no sets (caller treats as unrestricted); empty fields + null filter when any set is unrestricted
     */
    public function merge(array $sets): ?array
    {
        if ($sets === []) {
            return null;
        }

        $anyUnrestrictedFields = false;
        $mergedFields = [];
        $filterSets = [];

        foreach ($sets as $set) {
            if ($set['fields'] === []) {
                $anyUnrestrictedFields = true;
            } else {
                foreach ($set['fields'] as $name => $flags) {
                    $mergedFields[$name] = [
                        'read' => (bool) (($mergedFields[$name]['read'] ?? false) || ($flags['read'] ?? false)),
                        'create' => (bool) (($mergedFields[$name]['create'] ?? false) || ($flags['create'] ?? false)),
                        'update' => (bool) (($mergedFields[$name]['update'] ?? false) || ($flags['update'] ?? false)),
                    ];
                }
            }

            if ($set['item_filter'] === null) {
                // unrestricted filter wins
                $filterSets = [];
                break;
            }

            $filterSets[] = $set['item_filter'];
        }

        // Any role with unrestricted item_filter → no filter
        $itemFilter = null;
        if ($filterSets !== []) {
            // ponytail: OR filters by keeping first non-null as primary AND-set is wrong for multi-role;
            // store as synthetic OR by evaluating any-match at runtime via itemMatchesAny helper instead.
            // For storage we keep the first filter and expose matchesAny separately.
            $itemFilter = $filterSets[0];
            if (count($filterSets) > 1) {
                // Encode multi-role OR as special meta; evaluator uses matchesAnyFilters
                $itemFilter = ['_or' => $filterSets];
            }
        }

        return [
            'fields' => $anyUnrestrictedFields ? [] : $mergedFields,
            'item_filter' => $itemFilter,
        ];
    }

    /**
     * @param  array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}  $normalized
     * @param  array<string, mixed>  $data
     */
    public function itemMatchesMerged(array $normalized, array $data): bool
    {
        $filter = $normalized['item_filter'];
        if ($filter === null) {
            return true;
        }

        if (isset($filter['_or']) && is_array($filter['_or'])) {
            foreach ($filter['_or'] as $candidate) {
                if (! is_array($candidate)) {
                    continue;
                }
                $rules = $candidate['rules'] ?? [];
                if (! is_array($rules) || $rules === [] || $this->conditionEvaluator->rulesMatch($rules, $data)) {
                    return true;
                }
            }

            return false;
        }

        return $this->itemMatches($normalized, $data);
    }
}
