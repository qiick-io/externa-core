/**
 * Parse / serialize collection item list filters for CollectionItemQueryService dialect.
 * URL shape: filter[field][_eq]=…, filter[title]=hello (bare → _contains).
 */

export const FILTER_OPERATORS = [
    '_eq',
    '_neq',
    '_contains',
    '_in',
    '_null',
    '_nnull',
    '_gt',
    '_gte',
    '_lt',
    '_lte',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type FilterRule = {
    id: string;
    field: string;
    operator: FilterOperator;
    value: string;
};

/** Keys mixed into Inertia `filters` that are not field filters. */
export const FILTER_META_KEYS = new Set(['trashed', 'sort', 'direction']);

const NON_FILTERABLE_TYPES = new Set([
    'image',
    'file',
    'files',
    'map',
    'm2a',
    'blocks',
    'relation',
    'many_to_one',
    'one_to_many',
    'many_to_many',
    'relation_tree',
    'relation_many',
    'wysiwyg',
    'markdown',
    'code',
    'hash',
]);

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
    _eq: 'equals',
    _neq: 'not equals',
    _contains: 'contains',
    _in: 'is one of',
    _null: 'is empty',
    _nnull: 'is not empty',
    _gt: 'greater than',
    _gte: 'greater or equal',
    _lt: 'less than',
    _lte: 'less or equal',
};

export function operatorNeedsValue(operator: FilterOperator): boolean {
    return operator !== '_null' && operator !== '_nnull';
}

export function isFilterableFieldType(type: string): boolean {
    return !NON_FILTERABLE_TYPES.has(type);
}

let ruleIdSeq = 0;

export function newFilterRuleId(): string {
    ruleIdSeq += 1;

    return `fr-${Date.now()}-${ruleIdSeq}`;
}

export function emptyFilterRule(field = ''): FilterRule {
    return {
        id: newFilterRuleId(),
        field,
        operator: '_contains',
        value: '',
    };
}

/**
 * Turn Inertia/URL filter props into editable rows (one operator per field).
 */
export function parseFiltersFromProps(
    filters: Record<string, unknown> | undefined | null,
): FilterRule[] {
    if (!filters || typeof filters !== 'object') {
        return [];
    }

    const rules: FilterRule[] = [];

    for (const [field, raw] of Object.entries(filters)) {
        if (FILTER_META_KEYS.has(field) || field === '') {
            continue;
        }

        if (raw === null || raw === undefined || raw === '') {
            continue;
        }

        if (typeof raw !== 'object' || Array.isArray(raw)) {
            const value = Array.isArray(raw)
                ? raw.map(String).join(',')
                : String(raw);
            rules.push({
                id: newFilterRuleId(),
                field,
                operator: '_contains',
                value,
            });
            continue;
        }

        const ops = raw as Record<string, unknown>;
        let matched = false;

        for (const op of FILTER_OPERATORS) {
            if (!(op in ops)) {
                continue;
            }

            matched = true;
            const operand = ops[op];

            if (op === '_null' || op === '_nnull') {
                rules.push({
                    id: newFilterRuleId(),
                    field,
                    operator: op,
                    value: '1',
                });
                continue;
            }

            if (Array.isArray(operand)) {
                rules.push({
                    id: newFilterRuleId(),
                    field,
                    operator: op,
                    value: operand.map(String).join(','),
                });
            } else {
                rules.push({
                    id: newFilterRuleId(),
                    field,
                    operator: op,
                    value: operand == null ? '' : String(operand),
                });
            }
        }

        if (!matched) {
            // Bare object without known operators — skip
        }
    }

    return rules;
}

/**
 * Serialize UI rules to query `filter` object for Inertia router.get.
 * Multiple rules on the same field merge operators (AND).
 */
export function serializeFilterRules(
    rules: FilterRule[],
): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};

    for (const rule of rules) {
        if (!rule.field) {
            continue;
        }

        if (!operatorNeedsValue(rule.operator)) {
            out[rule.field] = {
                ...(out[rule.field] ?? {}),
                [rule.operator]: '1',
            };
            continue;
        }

        const value = rule.value.trim();

        if (value === '') {
            continue;
        }

        out[rule.field] = {
            ...(out[rule.field] ?? {}),
            [rule.operator]: value,
        };
    }

    return out;
}

export function countActiveFilterRules(rules: FilterRule[]): number {
    return rules.filter((rule) => {
        if (!rule.field) {
            return false;
        }

        if (!operatorNeedsValue(rule.operator)) {
            return true;
        }

        return rule.value.trim() !== '';
    }).length;
}
