import { Eye, EyeOff, WandSparkles } from 'lucide-react';
import type { ComponentProps, Ref } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
    evaluatePasswordStrength,
    type PasswordPolicy,
} from '@/lib/password-strength';
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
 * Password input with toggle to reveal or hide the value.
 * @param {Omit<ComponentProps<'input'>, 'type'> & { ref?: Ref<HTMLInputElement> }} props - Standard input props without type.
 * @returns {JSX.Element}
 */
export default function PasswordInput({
    className,
    ref,
    showGenerateButton = false,
    generateLabel = 'Generate secure password',
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
            ? 'bg-emerald-500'
            : strength?.level === 'medium'
              ? 'bg-amber-500'
              : 'bg-red-500';
    const strengthLabelColor =
        strength?.level === 'strong'
            ? 'text-emerald-600'
            : strength?.level === 'medium'
              ? 'text-amber-600'
              : 'text-muted-foreground';

    return (
        <div className="space-y-2">
            <div className="relative">
                <Input
                    type={showPassword ? 'text' : 'password'}
                    className={cn(
                        showGenerateButton ? 'pr-20' : 'pr-10',
                        className,
                    )}
                    ref={ref}
                    {...props}
                />
                {showGenerateButton && (
                    <button
                        type="button"
                        onClick={() => onGenerated?.(generateSecurePassword())}
                        className="absolute inset-y-0 right-10 flex items-center px-2 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                        aria-label={generateLabel}
                        title={generateLabel}
                    >
                        <WandSparkles className="size-4" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={showPassword ? t('common.hide') : t('common.view')}
                    tabIndex={-1}
                >
                    {showPassword ? (
                        <EyeOff className="size-4" />
                    ) : (
                        <Eye className="size-4" />
                    )}
                </button>
            </div>
            {strength && (
                <div id={strengthId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                            Password strength
                        </span>
                        <span className={cn('font-medium', strengthLabelColor)}>
                            {t(
                                `settings.project.passwordPolicies.${strength.level}.label`,
                            )}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn(
                                'h-full rounded-full transition-[width]',
                                meterColor,
                            )}
                            style={{ width: `${strength.progress}%` }}
                        />
                    </div>
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
                                    ? 'text-emerald-600'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {strength.meetsPolicy
                                ? 'Meets project password policy.'
                                : 'Keep going to meet project password policy.'}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
