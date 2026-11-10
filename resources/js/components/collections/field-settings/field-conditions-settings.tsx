import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
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

const OPERATORS: { value: FieldConditionOperator; labelKey: string }[] = [
    {
        value: 'equals',
        labelKey: 'collections.fieldSettings.conditions.operators.equals',
    },
    {
        value: 'not_equals',
        labelKey: 'collections.fieldSettings.conditions.operators.notEquals',
    },
    {
        value: 'contains',
        labelKey: 'collections.fieldSettings.conditions.operators.contains',
    },
    {
        value: 'empty',
        labelKey: 'collections.fieldSettings.conditions.operators.empty',
    },
    {
        value: 'not_empty',
        labelKey: 'collections.fieldSettings.conditions.operators.notEmpty',
    },
    {
        value: 'gt',
        labelKey: 'collections.fieldSettings.conditions.operators.gt',
    },
    {
        value: 'gte',
        labelKey: 'collections.fieldSettings.conditions.operators.gte',
    },
    {
        value: 'lt',
        labelKey: 'collections.fieldSettings.conditions.operators.lt',
    },
    {
        value: 'lte',
        labelKey: 'collections.fieldSettings.conditions.operators.lte',
    },
    {
        value: 'in',
        labelKey: 'collections.fieldSettings.conditions.operators.in',
    },
    {
        value: 'not_in',
        labelKey: 'collections.fieldSettings.conditions.operators.notIn',
    },
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
                    {t('collections.fieldSettings.conditions.intro')}
                </p>
                <Button
                    type="button"
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
                    {t('collections.fieldSettings.conditions.addConditions')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                {t('collections.fieldSettings.conditions.hint')}
            </p>

            <Field className="sm:max-w-xs">
                <FieldLabel htmlFor="condition_logic">
                    {t('collections.fieldSettings.conditions.match')}
                </FieldLabel>
                <NativeSelect
                    id="condition_logic"
                    className="w-full"
                    value={conditions.logic}
                    onChange={(event) =>
                        onChange({
                            ...conditions,
                            logic: event.target.value === 'or' ? 'or' : 'and',
                        })
                    }
                >
                    <option value="and">
                        {t('collections.fieldSettings.conditions.matchAll')}
                    </option>
                    <option value="or">
                        {t('collections.fieldSettings.conditions.matchAny')}
                    </option>
                </NativeSelect>
            </Field>

            <div className="space-y-3">
                {conditions.rules.map((rule, index) => (
                    <div
                        key={index}
                        className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                        <Field>
                            <FieldLabel>
                                {t(
                                    'collections.fieldSettings.conditions.field',
                                )}
                            </FieldLabel>
                            <NativeSelect
                                className="w-full"
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
                                <option value="">
                                    {t(
                                        'collections.fieldSettings.conditions.selectField',
                                    )}
                                </option>
                                {siblingFieldNames.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel>
                                {t('collections.fieldSettings.rules.operator')}
                            </FieldLabel>
                            <NativeSelect
                                className="w-full"
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
                                        {t(operator.labelKey)}
                                    </option>
                                ))}
                            </NativeSelect>
                        </Field>
                        {VALUELESS.includes(rule.operator) ? (
                            <div />
                        ) : (
                            <Field>
                                <FieldLabel>
                                    {rule.operator === 'in' ||
                                    rule.operator === 'not_in'
                                        ? t(
                                              'collections.fieldSettings.conditions.valuesCommaSeparated',
                                          )
                                        : t(
                                              'collections.fieldSettings.rules.value',
                                          )}
                                </FieldLabel>
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
                            </Field>
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
                    {t('collections.fieldSettings.rules.addRule')}
                </Button>
            </div>

            <div className="space-y-3">
                <SettingCheckbox
                    id="condition_hidden"
                    label={t(
                        'collections.fieldSettings.conditions.hideWhenMatched',
                    )}
                    description={t(
                        'collections.fieldSettings.conditions.hideWhenMatchedHint',
                    )}
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
                    label={t(
                        'collections.fieldSettings.conditions.showWhenMatched',
                    )}
                    description={t(
                        'collections.fieldSettings.conditions.showWhenMatchedHint',
                    )}
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
                    label={t(
                        'collections.fieldSettings.conditions.readonlyWhenMatched',
                    )}
                    description={t(
                        'collections.fieldSettings.conditions.readonlyWhenMatchedHint',
                    )}
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
                    label={t(
                        'collections.fieldSettings.conditions.requiredWhenMatched',
                    )}
                    description={t(
                        'collections.fieldSettings.conditions.requiredWhenMatchedHint',
                    )}
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
                variant="ghost"
                onClick={() => onChange(null)}
            >
                {t('collections.fieldSettings.conditions.removeConditions')}
            </Button>
        </div>
    );
}
