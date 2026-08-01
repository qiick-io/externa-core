/**
 * Browser check: Enable 2FA modal must keep QR + setup key visible (no sticky spinners).
 * Run: node tests/Browser/qa-two-factor-setup.mjs
 */
import { chromium, selectors } from 'playwright';

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
    if (!page.url().includes('confirm-password') && !page.url().includes('password/confirm')) {
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

    try {
        await login(page);
        await gotoSecurity(page);

        const disableBtn = page.getByRole('button', { name: /disable.*2fa|disable two-factor/i });
        if (await disableBtn.count()) {
            console.log('2FA already enabled — disabling first');
            await disableBtn.first().click();
            await page.waitForTimeout(800);
            await gotoSecurity(page);
        }

        const continueBtn = page.getByRole('button', { name: /continue setup|continua/i });
        const enableBtn = page.getByRole('button', { name: /enable.*2fa|enable two-factor|abilita/i });

        if (await continueBtn.count()) {
            await continueBtn.first().click();
        } else if (await enableBtn.count()) {
            await enableBtn.first().click();
        } else {
            throw new Error('No enable/continue 2FA button found');
        }

        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ state: 'visible', timeout: 10000 });

        // Wait until QR svg OR setup key input appears (not forever-spinner).
        await page.waitForFunction(
            () => {
                const dlg = document.querySelector('[role="dialog"]');
                if (!dlg) return false;
                const hasSvg = Boolean(dlg.querySelector('svg'));
                const keyInput = dlg.querySelector('input[readonly]');
                const hasKey = Boolean(keyInput && keyInput.value && keyInput.value.length > 5);
                return hasSvg && hasKey;
            },
            { timeout: 15000 },
        );

        const keyBefore = await dialog.locator('input[readonly]').first().inputValue();
        console.log('QR + key loaded:', keyBefore.slice(0, 4) + '…');

        // Regression window: old bug wiped data within ~1s of first paint.
        await page.waitForTimeout(2500);

        const stillVisible = await page.evaluate(() => {
            const dlg = document.querySelector('[role="dialog"]');
            if (!dlg) return { ok: false, reason: 'dialog gone' };
            const hasSvg = Boolean(dlg.querySelector('.aspect-square svg, [class*="aspect"] svg, svg'));
            const keyInput = dlg.querySelector('input[readonly]');
            const hasKey = Boolean(keyInput && keyInput.value && keyInput.value.length > 5);
            const spinners = dlg.querySelectorAll('[data-slot="spinner"], .animate-spin');
            return {
                ok: hasSvg && hasKey,
                hasSvg,
                hasKey,
                spinnerCount: spinners.length,
                keyLen: keyInput?.value?.length ?? 0,
            };
        });

        if (!stillVisible.ok) {
            throw new Error(`QR/key vanished after load: ${JSON.stringify(stillVisible)}`);
        }

        const keyAfter = await dialog.locator('input[readonly]').first().inputValue();
        if (keyAfter !== keyBefore) {
            throw new Error('setup key changed after stable load');
        }

        // Continue → OTP step must work.
        await dialog.getByRole('button', { name: /continue|continua/i }).first().click();
        await dialog.locator('input').first().waitFor({ state: 'visible', timeout: 5000 });

        console.log('PASS: 2FA setup modal kept QR+key and reached OTP step');
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('FAIL:', err.message ?? err);
    process.exit(1);
});
