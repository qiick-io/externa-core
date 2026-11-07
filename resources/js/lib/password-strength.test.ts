import { expect, test } from 'vitest';
import { evaluatePasswordStrength } from './password-strength.ts';

test('weak policy pass does not imply full green bar', () => {
    const strength = evaluatePasswordStrength('1234567', 'weak');

    expect(strength.level).toBe('weak');
    expect(strength.meetsPolicy).toBe(true);
    expect(strength.progress < 50).toBeTruthy();
});

test('strong password fills bar and meets strong policy', () => {
    const strength = evaluatePasswordStrength('SecurePass1!', 'strong');

    expect(strength.level).toBe('strong');
    expect(strength.meetsPolicy).toBe(true);
    expect(strength.progress).toBe(100);
});
