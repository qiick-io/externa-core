import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePasswordStrength } from './password-strength.ts';

test('weak policy pass does not imply full green bar', () => {
    const strength = evaluatePasswordStrength('1234567', 'weak');

    assert.equal(strength.level, 'weak');
    assert.equal(strength.meetsPolicy, true);
    assert.ok(strength.progress < 50);
});

test('strong password fills bar and meets strong policy', () => {
    const strength = evaluatePasswordStrength('SecurePass1!', 'strong');

    assert.equal(strength.level, 'strong');
    assert.equal(strength.meetsPolicy, true);
    assert.equal(strength.progress, 100);
});
