import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
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
                'space-y-5 rounded-lg border bg-muted/30 p-4',
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
 * Labeled checkbox row for field settings.
 * @returns {JSX.Element}
 */
export function SettingCheckbox(props: SettingCheckboxProps) {
    const { id, label, description, disabled = false, disabledReason } = props;

    const input =
        'checked' in props && props.onCheckedChange ? (
            <input
                id={id}
                type="checkbox"
                checked={props.checked}
                disabled={disabled}
                onChange={(event) =>
                    props.onCheckedChange(event.target.checked)
                }
                className="mt-1 size-4 shrink-0 rounded border disabled:cursor-not-allowed disabled:opacity-50"
            />
        ) : (
            <input
                id={id}
                type="checkbox"
                name={props.name}
                value={props.value ?? '1'}
                defaultChecked={props.defaultChecked}
                disabled={disabled}
                className="mt-1 size-4 shrink-0 rounded border disabled:cursor-not-allowed disabled:opacity-50"
            />
        );

    return (
        <div
            className={cn(
                'flex items-start gap-4',
                disabled && 'opacity-80',
            )}
        >
            {disabled && disabledReason ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">{input}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                        {disabledReason}
                    </TooltipContent>
                </Tooltip>
            ) : (
                input
            )}
            <div className="grid gap-2">
                <Label
                    htmlFor={id}
                    className={disabled ? 'cursor-not-allowed' : undefined}
                >
                    {label}
                </Label>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {disabled && disabledReason
                        ? disabledReason
                        : description}
                </p>
            </div>
        </div>
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
