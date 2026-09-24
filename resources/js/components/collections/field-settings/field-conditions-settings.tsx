import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseFieldConditions } from '@/lib/field-conditions';
import type {
    FieldConditionOperator,
    FieldConditions,
} from '@/lib/field-conditions';

type FieldConditionsSettingsProps = {
    settings?: Record<string, unknown> | null;
    siblingFieldNames: string[];
    value: FieldConditions | null;
    onChange: (next: FieldConditions | null) => void;
};

const OPERATORS: { value: FieldConditionOperator; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'empty', label: 'Is empty' },
    { value: 'not_empty', label: 'Is not empty' },
    { value: 'gt', label: 'Greater than' },
    { value: 'gte', label: 'Greater or equal' },
    { value: 'lt', label: 'Less than' },
    { value: 'lte', label: 'Less or equal' },
    { value: 'in', label: 'In list' },
    { value: 'not_in', label: 'Not in list' },
];

const VALUELESS: FieldConditionOperator[] = ['empty', 'not_empty'];

/**
 * Per-field condition rules: when rules match (AND/OR), apply optional hidden/readonly/required.
 */
export function FieldConditionsSettings({
    settings,
    siblingFieldNames,
    value,
    onChange,
}: FieldConditionsSettingsProps) {
    const { t } = useTranslation();
    const conditions = value ??
        parseFieldConditions(settings) ?? {
            logic: 'and' as const,
            rules: [],
        };

    const enabled = conditions.rules.length > 0 || value !== null;

    if (!enabled && value === null) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    Optionally show, lock, or require this field based on other
                    field values (AND or OR).
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                        onChange({
                            logic: 'and',
                            rules: [
                                {
                                    field: siblingFieldNames[0] ?? '',
                                    operator: 'equals',
                                    value: '',
                                },
                            ],
                        })
                    }
                >
                    <Plus className="size-4" />
                    Add conditions
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                When rules match, apply the flags below. Flat AND / OR only — no
                nested groups.
            </p>

            <div className="grid gap-1 sm:max-w-xs">
                <Label htmlFor="condition_logic">Match</Label>
                <select
                    id="condition_logic"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={conditions.logic}
                    onChange={(event) =>
                        onChange({
                            ...conditions,
                            logic: event.target.value === 'or' ? 'or' : 'and',
                        })
                    }
                >
                    <option value="and">All rules (AND)</option>
                    <option value="or">Any rule (OR)</option>
                </select>
            </div>

            <div className="space-y-3">
                {conditions.rules.map((rule, index) => (
                    <div
                        key={index}
                        className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                        <div className="grid gap-1">
                            <Label>Field</Label>
                            <select
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                value={rule.field}
                                onChange={(event) => {
                                    const rules = conditions.rules.map(
                                        (entry, entryIndex) =>
                                            entryIndex === index
                                                ? {
                                                      ...entry,
                                                      field: event.target.value,
                                                  }
                                                : entry,
                                    );
                                    onChange({ ...conditions, rules });
                                }}
                            >
                                <option value="">Select field…</option>
                                {siblingFieldNames.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1">
                            <Label>Operator</Label>
                            <select
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                value={rule.operator}
                                onChange={(event) => {
                                    const operator = event.target
                                        .value as FieldConditionOperator;
                                    const rules = conditions.rules.map(
                                        (entry, entryIndex) =>
                                            entryIndex === index
                                                ? {
                                                      ...entry,
                                                      operator,
                                                      value: VALUELESS.includes(
                                                          operator,
                                                      )
                                                          ? undefined
                                                          : (entry.value ?? ''),
                                                  }
                                                : entry,
                                    );
                                    onChange({ ...conditions, rules });
                                }}
                            >
                                {OPERATORS.map((operator) => (
                                    <option
                                        key={operator.value}
                                        value={operator.value}
                                    >
                                        {operator.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {VALUELESS.includes(rule.operator) ? (
                            <div />
                        ) : (
                            <div className="grid gap-1">
                                <Label>
                                    {rule.operator === 'in' ||
                                    rule.operator === 'not_in'
                                        ? 'Values (comma-separated)'
                                        : 'Value'}
                                </Label>
                                <Input
                                    value={String(rule.value ?? '')}
                                    placeholder={
                                        rule.operator === 'in' ||
                                        rule.operator === 'not_in'
                                            ? 'draft, published'
                                            : undefined
                                    }
                                    onChange={(event) => {
                                        const rules = conditions.rules.map(
                                            (entry, entryIndex) =>
                                                entryIndex === index
                                                    ? {
                                                          ...entry,
                                                          value: event.target
                                                              .value,
                                                      }
                                                    : entry,
                                        );
                                        onChange({ ...conditions, rules });
                                    }}
                                />
                            </div>
                        )}
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="self-end"
                            aria-label={t('a11y.removeConditionRule')}
                            onClick={() => {
                                const rules = conditions.rules.filter(
                                    (_, entryIndex) => entryIndex !== index,
                                );
                                onChange(
                                    rules.length === 0
                                        ? null
                                        : { ...conditions, rules },
                                );
                            }}
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                ))}

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                        onChange({
                            ...conditions,
                            rules: [
                                ...conditions.rules,
                                {
                                    field: siblingFieldNames[0] ?? '',
                                    operator: 'equals',
                                    value: '',
                                },
                            ],
                        })
                    }
                >
                    <Plus className="size-4" />
                    Add rule
                </Button>
            </div>

            <div className="space-y-3">
                <SettingCheckbox
                    id="condition_hidden"
                    label="Hide when matched"
                    description="Hide this field in the item form when the rules match."
                    checked={conditions.hidden === true}
                    onCheckedChange={(checked) => {
                        if (checked) {
                            onChange({ ...conditions, hidden: true });

                            return;
                        }

                        const next = { ...conditions };
                        delete next.hidden;
                        onChange(next);
                    }}
                />
                <SettingCheckbox
                    id="condition_show"
                    label="Show when matched"
                    description="Hide by default; show this field only when the rules match."
                    checked={conditions.hidden === false}
                    onCheckedChange={(checked) => {
                        if (checked) {
                            onChange({ ...conditions, hidden: false });

                            return;
                        }

                        const next = { ...conditions };
                        delete next.hidden;
                        onChange(next);
                    }}
                />
                <SettingCheckbox
                    id="condition_readonly"
                    label="Readonly when matched"
                    description="Lock the field when the rules match."
                    checked={conditions.readonly === true}
                    onCheckedChange={(checked) =>
                        onChange({
                            ...conditions,
                            readonly: checked || undefined,
                        })
                    }
                />
                <SettingCheckbox
                    id="condition_required"
                    label="Required when matched"
                    description="Require a value when the rules match (enforced server-side)."
                    checked={conditions.required === true}
                    onCheckedChange={(checked) =>
                        onChange({
                            ...conditions,
                            required: checked || undefined,
                        })
                    }
                />
            </div>

            <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(null)}
            >
                Remove conditions
            </Button>
        </div>
    );
}
