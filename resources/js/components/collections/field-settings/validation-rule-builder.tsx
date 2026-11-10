import { useTranslation } from 'react-i18next';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FIELD_VALIDATION_OPERATORS } from '@/lib/collection-field-types';
import type {
    FieldValidationRule,
    TranslatedText,
} from '@/lib/collection-field-types';

type ValidationRuleBuilderProps = {
    rules: FieldValidationRule[];
    validationMessage: TranslatedText;
    onRulesChange: (next: FieldValidationRule[]) => void;
    onValidationMessageChange: (next: TranslatedText) => void;
};

/**
 * UI for assembling collection field validation rules.
 */
export function ValidationRuleBuilder({
    rules,
    validationMessage,
    onRulesChange,
    onValidationMessageChange,
}: ValidationRuleBuilderProps) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                {rules.map((rule, index) => {
                    const meta = FIELD_VALIDATION_OPERATORS.find(
                        (option) => option.value === rule.operator,
                    );

                    return (
                        <div
                            key={index}
                            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
                        >
                            <Field>
                                <FieldLabel
                                    htmlFor={`validation_operator_${index}`}
                                >
                                    {t(
                                        'collections.fieldSettings.rules.operator',
                                    )}
                                </FieldLabel>
                                <NativeSelect
                                    id={`validation_operator_${index}`}
                                    value={rule.operator}
                                    onChange={(event) => {
                                        const operator = event.target
                                            .value as FieldValidationRule['operator'];
                                        const next = [...rules];
                                        next[index] = { operator };
                                        onRulesChange(next);
                                    }}
                                    className="w-full"
                                >
                                    {FIELD_VALIDATION_OPERATORS.map(
                                        (option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {t(
                                                    `collections.fieldSettings.rules.operators.${option.value}`,
                                                    {
                                                        defaultValue:
                                                            option.label,
                                                    },
                                                )}
                                            </option>
                                        ),
                                    )}
                                </NativeSelect>
                            </Field>
                            {meta?.needsValue ? (
                                <Field>
                                    <FieldLabel
                                        htmlFor={`validation_value_${index}`}
                                    >
                                        {t(
                                            'collections.fieldSettings.rules.value',
                                        )}
                                    </FieldLabel>
                                    <Input
                                        id={`validation_value_${index}`}
                                        value={
                                            rule.value === undefined
                                                ? ''
                                                : String(rule.value)
                                        }
                                        onChange={(event) => {
                                            const next = [...rules];
                                            next[index] = {
                                                ...rule,
                                                value: event.target.value,
                                            };
                                            onRulesChange(next);
                                        }}
                                    />
                                </Field>
                            ) : (
                                <div />
                            )}
                            <div className="flex items-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-label={t('a11y.removeRule')}
                                    onClick={() =>
                                        onRulesChange(
                                            rules.filter(
                                                (_, ruleIndex) =>
                                                    ruleIndex !== index,
                                            ),
                                        )
                                    }
                                >
                                    ×
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Button
                type="button"
                variant="outline"
                onClick={() =>
                    onRulesChange([
                        ...rules,
                        { operator: 'max_length', value: 255 },
                    ])
                }
            >
                {t('collections.fieldSettings.rules.addRule')}
            </Button>

            <TranslatedInput
                idPrefix="validation_message"
                label={t('collections.fieldSettings.validation.message')}
                description={t(
                    'collections.fieldSettings.validation.messageHint',
                )}
                value={validationMessage}
                onChange={onValidationMessageChange}
            />
        </div>
    );
}
