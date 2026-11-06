import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
} from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SettingsPanelProps = {
    title?: string;
    description?: string;
    children: ReactNode;
    className?: string;
};

/**
 * Layout wrapper for a field settings section.
 * @returns {JSX.Element}
 */
export function SettingsPanel({
    title,
    description,
    children,
    className,
}: SettingsPanelProps) {
    return (
        <div
            className={cn(
                'space-y-6 rounded-lg border bg-muted/30 p-4',
                className,
            )}
        >
            {title ? (
                <div>
                    <p className="text-sm font-medium">{title}</p>
                    {description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            ) : null}
            {children}
        </div>
    );
}

type SettingCheckboxControlledProps = {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    disabledReason?: string;
    name?: never;
    value?: never;
    defaultChecked?: never;
};

type SettingCheckboxUncontrolledProps = {
    id: string;
    label: string;
    description: string;
    name: string;
    value?: string;
    defaultChecked?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    checked?: never;
    onCheckedChange?: never;
};

type SettingCheckboxProps =
    SettingCheckboxControlledProps | SettingCheckboxUncontrolledProps;

/**
 * Labeled checkbox row for field settings: shadcn `Field` (horizontal) with
 * `Checkbox`, `FieldLabel` and `FieldDescription`. The uncontrolled variant
 * submits `name` / `value` like a native checkbox (Radix renders a hidden
 * input inside forms); unchecked boxes submit nothing.
 * @returns {JSX.Element}
 */
export function SettingCheckbox(props: SettingCheckboxProps) {
    const { id, label, description, disabled = false, disabledReason } = props;

    const checkbox =
        'checked' in props && props.onCheckedChange ? (
            <Checkbox
                id={id}
                checked={props.checked}
                disabled={disabled}
                onCheckedChange={(checked) =>
                    props.onCheckedChange(checked === true)
                }
            />
        ) : (
            <Checkbox
                id={id}
                name={props.name}
                value={props.value ?? '1'}
                defaultChecked={props.defaultChecked}
                disabled={disabled}
            />
        );

    return (
        <Field
            orientation="horizontal"
            data-disabled={disabled || undefined}
            className="gap-4"
        >
            {disabled && disabledReason ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">{checkbox}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                        {disabledReason}
                    </TooltipContent>
                </Tooltip>
            ) : (
                checkbox
            )}
            <FieldContent>
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                <FieldDescription>
                    {disabled && disabledReason ? disabledReason : description}
                </FieldDescription>
            </FieldContent>
        </Field>
    );
}

/**
 * Section divider with optional label in field settings.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function SettingsDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {label}
            </span>
            <Separator className="flex-1" />
        </div>
    );
}
