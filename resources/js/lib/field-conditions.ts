/** Simple field form conditions (mirrors PHP FieldConditionEvaluator). */

export type FieldConditionOperator =
    'equals' | 'not_equals' | 'empty' | 'not_empty';

export type FieldConditionRule = {
    field: string;
    operator: FieldConditionOperator;
    value?: unknown;
};

export type FieldConditions = {
    logic: 'and';
    rules: FieldConditionRule[];
    hidden?: boolean;
    readonly?: boolean;
    required?: boolean;
};

export type EffectiveFieldFlags = {
    hidden: boolean;
    readonly: boolean;
    required: boolean;
};

function settingsFlag(value: unknown): boolean {
    return (
        value === true ||
        value === 1 ||
        value === '1' ||
        value === 'true' ||
        value === 'on'
    );
}

function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) {
        return true;
    }

    if (typeof value === 'string') {
        return value.trim() === '';
    }

    if (Array.isArray(value)) {
        return value.length === 0;
    }

    return false;
}

function asLooseBoolean(value: unknown): boolean | null {
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') {
        return true;
    }

    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off') {
        return false;
    }

    return null;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(actual)) {
        if (typeof expected === 'string' || typeof expected === 'number') {
            return actual.map(String).includes(String(expected));
        }

        return false;
    }

    if (actual === null || actual === undefined) {
        return expected === null || expected === undefined || expected === '';
    }

    // ponytail: HTML booleans are "0"/"1"; conditions often store true/false
    const actualBool = asLooseBoolean(actual);
    const expectedBool = asLooseBoolean(expected);

    if (actualBool !== null && expectedBool !== null) {
        return actualBool === expectedBool;
    }

    return String(actual) === String(expected);
}

function singleRuleMatches(
    rule: FieldConditionRule,
    data: Record<string, unknown>,
): boolean {
    const actual = data[rule.field];

    switch (rule.operator) {
        case 'empty':
            return isEmpty(actual);
        case 'not_empty':
            return !isEmpty(actual);
        case 'not_equals':
            return !valuesEqual(actual, rule.value);
        default:
            return valuesEqual(actual, rule.value);
    }
}

/**
 * Parse conditions from field settings JSON.
 */
export function parseFieldConditions(
    settings?: Record<string, unknown> | null,
): FieldConditions | null {
    const raw = settings?.conditions;

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const record = raw as Record<string, unknown>;
    const rawRules = Array.isArray(record.rules) ? record.rules : [];
    const rules: FieldConditionRule[] = [];

    for (const entry of rawRules) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const rule = entry as Record<string, unknown>;
        const field = String(rule.field ?? '').trim();

        if (field === '') {
            continue;
        }

        const operatorRaw = String(rule.operator ?? 'equals');
        const operator: FieldConditionOperator = [
            'equals',
            'not_equals',
            'empty',
            'not_empty',
        ].includes(operatorRaw)
            ? (operatorRaw as FieldConditionOperator)
            : 'equals';

        const normalized: FieldConditionRule = { field, operator };

        if (operator !== 'empty' && operator !== 'not_empty') {
            normalized.value = rule.value;
        }

        rules.push(normalized);
    }

    if (rules.length === 0) {
        return null;
    }

    const conditions: FieldConditions = {
        logic: 'and',
        rules,
    };

    for (const key of ['hidden', 'readonly', 'required'] as const) {
        if (key in record) {
            conditions[key] = settingsFlag(record[key]);
        }
    }

    return conditions;
}

/**
 * Effective hidden / readonly / required after applying conditions to base settings.
 *
 * When rules match: apply optional hidden/readonly/required overrides.
 * When rules do not match and hidden is explicitly false (show-when): force hidden.
 *
 * ponytail: AND-only equality/emptiness — no OR / nested groups.
 */
export function evaluateFieldFlags(
    settings: Record<string, unknown> | null | undefined,
    data: Record<string, unknown>,
): EffectiveFieldFlags {
    const baseRequired =
        settingsFlag(settings?.required) ||
        (Array.isArray(settings?.validation_rules) &&
            settings.validation_rules.some(
                (rule) =>
                    rule &&
                    typeof rule === 'object' &&
                    (rule as { operator?: string }).operator === 'required',
            ));

    const flags: EffectiveFieldFlags = {
        hidden: settingsFlag(settings?.hidden_in_form),
        readonly: settingsFlag(settings?.readonly),
        required: baseRequired,
    };

    const conditions = parseFieldConditions(settings);

    if (!conditions) {
        return flags;
    }

    const matches = conditions.rules.every((rule) =>
        singleRuleMatches(rule, data),
    );

    if (!matches) {
        // Show-when: explicit hidden:false means visible only while rules match.
        if (conditions.hidden === false) {
            flags.hidden = true;
        }

        return flags;
    }

    if (conditions.hidden !== undefined) {
        flags.hidden = conditions.hidden;
    }

    if (conditions.readonly !== undefined) {
        flags.readonly = conditions.readonly;
    }

    if (conditions.required !== undefined) {
        flags.required = conditions.required;
    }

    return flags;
}
