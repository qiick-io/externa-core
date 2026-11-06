import { Eye, EyeOff, WandSparkles } from 'lucide-react';
import type { ComponentProps, Ref } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group';
import { Progress } from '@/components/ui/progress';
import { evaluatePasswordStrength } from '@/lib/password-strength';
import type { PasswordPolicy } from '@/lib/password-strength';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
    ref?: Ref<HTMLInputElement>;
    showGenerateButton?: boolean;
    generateLabel?: string;
    onGenerated?: (password: string) => void;
    showStrength?: boolean;
    strengthPolicy?: PasswordPolicy;
    strengthId?: string;
};

function randomChar(alphabet: string): string {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);

    return alphabet[bytes[0] % alphabet.length];
}

function shuffle(value: string): string {
    const chars = value.split('');

    for (let index = chars.length - 1; index > 0; index -= 1) {
        const bytes = new Uint32Array(1);
        crypto.getRandomValues(bytes);
        const swapIndex = bytes[0] % (index + 1);
        [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
    }

    return chars.join('');
}

function generateSecurePassword(): string {
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const numbers = '23456789';
    const symbols = '!@#$%^&*()-_=+[]{}?';
    const all = `${lowercase}${uppercase}${numbers}${symbols}`;
    const required = [
        randomChar(lowercase),
        randomChar(uppercase),
        randomChar(numbers),
        randomChar(symbols),
    ];

    while (required.length < 16) {
        required.push(randomChar(all));
    }

    return shuffle(required.join(''));
}

/**
 * Password input with toggle to reveal or hide the value, on the shadcn
 * InputGroup: the reveal and generate buttons sit in an inline-end addon.
 * `className` styles the group (the bordered box), not the inner input.
 * @param {Omit<ComponentProps<'input'>, 'type'> & { ref?: Ref<HTMLInputElement> }} props - Standard input props without type.
 * @returns {JSX.Element}
 */
export default function PasswordInput({
    className,
    ref,
    showGenerateButton = false,
    generateLabel,
    onGenerated,
    showStrength = false,
    strengthPolicy = 'medium',
    strengthId,
    ...props
}: PasswordInputProps) {
    const { t } = useTranslation();
    const [showPassword, setShowPassword] = useState(false);
    const value =
        typeof props.value === 'string'
            ? props.value
            : typeof props.defaultValue === 'string'
              ? props.defaultValue
              : '';
    const strength = showStrength
        ? evaluatePasswordStrength(value, strengthPolicy)
        : null;
    const meterColor =
        strength?.level === 'strong'
            ? '[&_[data-slot=progress-indicator]]:bg-success'
            : strength?.level === 'medium'
              ? '[&_[data-slot=progress-indicator]]:bg-warning'
              : '[&_[data-slot=progress-indicator]]:bg-destructive';
    const strengthLabelColor =
        strength?.level === 'strong'
            ? 'text-success'
            : strength?.level === 'medium'
              ? 'text-warning'
              : 'text-muted-foreground';

    return (
        <div className="space-y-2">
            <InputGroup
                className={cn('dark:bg-transparent', className)}
                data-disabled={props.disabled ? true : undefined}
            >
                <InputGroupInput
                    type={showPassword ? 'text' : 'password'}
                    ref={ref}
                    {...props}
                />
                <InputGroupAddon align="inline-end">
                    {showGenerateButton && (
                        <InputGroupButton
                            size="icon-xs"
                            onClick={() =>
                                onGenerated?.(generateSecurePassword())
                            }
                            disabled={props.disabled}
                            aria-label={
                                generateLabel ?? t('passwordInput.generate')
                            }
                            title={generateLabel ?? t('passwordInput.generate')}
                        >
                            <WandSparkles />
                        </InputGroupButton>
                    )}
                    <InputGroupButton
                        size="icon-xs"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={
                            showPassword ? t('common.hide') : t('common.view')
                        }
                    >
                        {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                </InputGroupAddon>
            </InputGroup>
            {strength && (
                <div id={strengthId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                            {t('passwordInput.strength')}
                        </span>
                        <span className={cn('font-medium', strengthLabelColor)}>
                            {t(
                                `settings.project.passwordPolicies.${strength.level}.label`,
                            )}
                        </span>
                    </div>
                    <Progress
                        value={strength.progress}
                        aria-hidden="true"
                        className={cn('h-1.5 bg-muted', meterColor)}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t(
                            `settings.project.passwordPolicies.${strengthPolicy}.description`,
                        )}
                    </p>
                    {value !== '' && (
                        <p
                            className={cn(
                                'text-xs',
                                strength.meetsPolicy
                                    ? 'text-success'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {strength.meetsPolicy
                                ? t('passwordInput.meetsPolicy')
                                : t('passwordInput.keepGoing')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
