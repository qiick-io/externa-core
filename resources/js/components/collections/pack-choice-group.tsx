import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/**
 * Starter-pack chooser shared by the collection and field pack dialogs:
 * a `RadioGroup` of choice cards (FieldLabel > Field > RadioGroupItem), so
 * the packs are one radio group with arrow-key navigation and a checked
 * state screen readers announce.
 * @returns {JSX.Element}
 */
export function PackChoiceGroup({
    idPrefix,
    ariaLabel,
    packs,
    value,
    onValueChange,
}: {
    idPrefix: string;
    ariaLabel: string;
    packs: Array<{ key: string; label: string; description: string }>;
    value: string | null;
    onValueChange: (key: string) => void;
}) {
    return (
        <RadioGroup
            aria-label={ariaLabel}
            value={value ?? undefined}
            onValueChange={onValueChange}
        >
            {packs.map((pack) => {
                const itemId = `${idPrefix}-${pack.key}`;

                return (
                    <FieldLabel
                        key={pack.key}
                        htmlFor={itemId}
                        className="cursor-pointer"
                    >
                        <Field orientation="horizontal">
                            <RadioGroupItem
                                id={itemId}
                                value={pack.key}
                                aria-labelledby={`${itemId}-label`}
                                aria-describedby={`${itemId}-description`}
                            />
                            <FieldContent>
                                <FieldTitle id={`${itemId}-label`}>
                                    {pack.label}
                                </FieldTitle>
                                <FieldDescription id={`${itemId}-description`}>
                                    {pack.description}
                                </FieldDescription>
                            </FieldContent>
                        </Field>
                    </FieldLabel>
                );
            })}
        </RadioGroup>
    );
}
