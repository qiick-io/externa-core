import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import {
    FIELD_VALIDATION_OPERATORS,
    type FieldValidationRule,
    type TranslatedText,
} from '@/lib/collection-field-types';

type ValidationRuleBuilderProps = {
    rules: FieldValidationRule[];
    validationMessage: TranslatedText;
    onRulesChange: (next: FieldValidationRule[]) => void;
    onValidationMessageChange: (next: TranslatedText) => void;
};

export function ValidationRuleBuilder({
    rules,
    validationMessage,
    onRulesChange,
    onValidationMessageChange,
}: ValidationRuleBuilderProps) {
    return (
        <div className="space-y-5">
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
                            <div className="grid gap-2">
                                <Label htmlFor={`validation_operator_${index}`}>
                                    Operator
                                </Label>
                                <select
                                    id={`validation_operator_${index}`}
                                    value={rule.operator}
                                    onChange={(event) => {
                                        const operator = event.target
                                            .value as FieldValidationRule['operator'];
                                        const next = [...rules];
                                        next[index] = { operator };
                                        onRulesChange(next);
                                    }}
                                    className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs"
                                >
                                    {FIELD_VALIDATION_OPERATORS.map((option) => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {meta?.needsValue ? (
                                <div className="grid gap-2">
                                    <Label htmlFor={`validation_value_${index}`}>
                                        Value
                                    </Label>
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
                                </div>
                            ) : (
                                <div />
                            )}
                            <div className="flex items-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-label="Remove rule"
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
                size="sm"
                onClick={() =>
                    onRulesChange([
                        ...rules,
                        { operator: 'max_length', value: 255 },
                    ])
                }
            >
                Add rule
            </Button>

            <TranslatedInput
                idPrefix="validation_message"
                label="Validation message"
                description="Optional custom error shown when a rule fails."
                value={validationMessage}
                onChange={onValidationMessageChange}
            />
        </div>
    );
}
