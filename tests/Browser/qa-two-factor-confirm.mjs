/**
 * Browser check: 2FA confirm with TOTP from the shown setup key must succeed.
 * Run: node tests/Browser/qa-two-factor-confirm.mjs
 */
import { execFileSync } from 'node:child_process';
import { chromium, selectors } from 'playwright';

function totp(secret) {
    const php = process.env.PHP_BIN ?? '/Users/lucagiardi/Library/Application Support/Herd/bin/php84';
    return execFileSync(
        php,
        [
            '-r',
            "require 'vendor/autoload.php'; echo (new PragmaRX\\Google2FA\\Google2FA)->getCurrentOtp($argv[1]);",
            secret,
        ],
        { encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname },
    ).trim();
}

selectors.setTestIdAttribute('data-test');

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';

async function login(page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASS);
    await page.getByRole('button', { name: /log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function confirmPasswordIfNeeded(page) {
    if (
        !page.url().includes('confirm-password') &&
        !page.url().includes('password/confirm')
    ) {
        const heading = page.getByRole('heading', { name: /confirm.*password/i });
        if ((await heading.count()) === 0) return;
    }

    await page.locator('input[type="password"], input[name="password"]').first().fill(PASS);
    await page.getByRole('button', { name: /confirm/i }).first().click();
    await page.waitForURL((url) => url.pathname.includes('/settings/security'), {
        timeout: 15000,
    });
}

async function gotoSecurity(page) {
    await page.goto(`${BASE}/settings/security`, { waitUntil: 'domcontentloaded' });
    await confirmPasswordIfNeeded(page);
    await page.waitForTimeout(400);
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_PATH ??
            `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    });
    const page = await browser.newPage();

    const posts = [];
    const traffic = [];
    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('externa-core.test') && !url.includes('.js') && !url.includes('.css') && !url.includes('vite')) {
            traffic.push({ t: Date.now(), method: req.method(), url });
        }
        if (req.method() === 'POST' && url.includes('confirmed-two-factor')) {
            posts.push({ url, postData: req.postData() });
        }
    });
    page.on('response', async (res) => {
        const url = res.url();
        if (url.includes('/settings/security') || res.status() === 302 || res.status() === 409) {
            traffic.push({ t: Date.now(), type: 'response', status: res.status(), url, loc: res.headers()['location'] || null });
        }
    });
    page.on('response', async (res) => {
        if (res.url().includes('confirmed-two-factor')) {
            let body = '';
            try {
                body = (await res.text()).slice(0, 500);
            } catch {
                body = '(unreadable)';
            }
            console.log('CONFIRM RESPONSE', res.status(), body.slice(0, 300));
        }
    });

    try {
        await login(page);
        await gotoSecurity(page);

        const disableBtn = page.getByRole('button', {
            name: /disable.*2fa|disable two-factor/i,
        });
        if (await disableBtn.count()) {
            console.log('2FA already enabled — disabling first');
            await disableBtn.first().click();
            await page.waitForTimeout(800);
            await gotoSecurity(page);
        }

        const continueBtn = page.getByRole('button', {
            name: /continue setup|continua/i,
        });
        const enableBtn = page.getByRole('button', {
            name: /enable.*2fa|enable two-factor|abilita/i,
        });

        if (await continueBtn.count()) {
            await continueBtn.first().click();
        } else if (await enableBtn.count()) {
            await enableBtn.first().click();
        } else {
            throw new Error('No enable/continue 2FA button found');
        }

        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ state: 'visible', timeout: 10000 });

        await page.waitForFunction(() => {
            const dlg = document.querySelector('[role="dialog"]');
            if (!dlg) return false;
            const keyInput = dlg.querySelector('input[readonly]');
            return Boolean(keyInput && keyInput.value && keyInput.value.length > 5);
        }, { timeout: 15000 });

        const setupKey = await dialog.locator('input[readonly]').first().inputValue();
        console.log('setup key', setupKey);

        // Wait past Fortify's same-second confirming_at window + any wipe race
        await page.waitForTimeout(2500);

        // Check whether a mid-setup revisit wiped the secret (key endpoint)
        const secretProbe = await page.evaluate(async () => {
            const res = await fetch('/user/two-factor-secret-key', {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            return { status: res.status, body: await res.text() };
        });
        console.log('secret probe after wait', secretProbe);

        await dialog.getByRole('button', { name: /continue|continua/i }).first().click();
        const otpInput = dialog.locator('input[data-input-otp], input[name="code"]').first();
        await otpInput.waitFor({ state: 'visible', timeout: 5000 });

        const code = totp(setupKey);
        console.log('otp', code);

        await otpInput.click();
        await page.keyboard.type(code, { delay: 30 });

        // Inspect form payload before submit
        const preSubmit = await dialog.evaluate(() => {
            const form = document.querySelector('[role="dialog"] form');
            if (!form) return { error: 'no form' };
            const fd = new FormData(form);
            return {
                entries: [...fd.entries()],
                otpName: form.querySelector('[data-input-otp]')?.getAttribute('name'),
                otpValue: form.querySelector('[data-input-otp]')?.value,
                otpDisabled: form.querySelector('[data-input-otp]')?.disabled,
            };
        });
        console.log('preSubmit', JSON.stringify(preSubmit));

        await dialog.getByRole('button', { name: /confirm|conferma/i }).click();
        await page.waitForTimeout(2000);

        console.log('posts', posts); console.log('traffic', JSON.stringify(traffic, null, 2));

        const errorText = await dialog.locator('.text-destructive, [data-slot="input-error"]').allTextContents();
        console.log('visible errors', errorText);

        // Success: disable button appears or enabled hint
        const enabled = await page.getByRole('button', {
            name: /disable.*2fa|disable two-factor/i,
        }).count();
        console.log('enabled?', enabled > 0);

        if (!enabled) {
            throw new Error('2FA confirm did not enable');
        }

        console.log('PASS: OTP confirm accepted');
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('FAIL:', err.message ?? err);
    process.exit(1);
});
