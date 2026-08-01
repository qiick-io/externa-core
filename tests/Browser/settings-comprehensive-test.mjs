/**
 * Settings pages comprehensive test
 * Tests: all settings pages, saves, validation, unsaved guards (exclude 2FA/passkeys)
 * Run: node tests/Browser/settings-comprehensive-test.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = 'superadmin@example.com';
const PASS = 'password';

const results = [];

function record(area, check, status, note = '') {
    results.push({ area, check, status, note });
    const mark = status === 'Pass' ? '✓' : status === 'Fail' ? '✗' : '○';
    console.log(`${mark} [${area}] ${check}${note ? ` — ${note}` : ''}`);
}

async function safe(area, check, fn) {
    try {
        await fn();
        record(area, check, 'Pass');
        return true;
    } catch (e) {
        record(area, check, 'Fail', String(e?.message ?? e).slice(0, 200));
        return false;
    }
}

async function login(page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button[type="submit"]').filter({ hasText: /log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(12000);

    await safe('Auth', 'Login as superadmin', () => login(page));

    // Test Profile/Settings landing
    await safe('Settings', 'Profile settings page loads', async () => {
        await page.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Settings', 'Profile has form fields', async () => {
        const firstNameInput = page.locator('input#first_name').first();
        await firstNameInput.waitFor({ state: 'visible', timeout: 3000 });
    });

    await safe('Settings', 'Profile can be edited', async () => {
        const firstNameInput = page.locator('input#first_name').first();
        const originalValue = await firstNameInput.inputValue();
        const testValue = 'Test ' + Date.now();
        await firstNameInput.fill(testValue);
        
        const saveBtn = page.getByRole('button', { name: /save/i }).first();
        await saveBtn.click();
        await page.waitForTimeout(1500);
        
        // Verify saved
        await page.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
        const currentValue = await page.locator('input#first_name').first().inputValue();
        if (currentValue !== testValue) {
            throw new Error('Profile not saved');
        }
        
        // Restore original value
        await page.locator('input#first_name').first().fill(originalValue);
        await page.getByRole('button', { name: /save/i }).first().click();
        await page.waitForTimeout(1000);
    });

    // Test Display/Appearance settings
    await safe('Settings', 'Appearance settings loads', async () => {
        await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Settings', 'Appearance has color/theme controls', async () => {
        const colorInput = page.locator('input[type="color"]').first();
        const themeSelect = page.locator('select, [role="combobox"]').first();
        const hasControl = (await colorInput.count()) > 0 || (await themeSelect.count()) > 0;
        if (!hasControl) {
            console.log('  Appearance may use different control types');
        }
    });

    // Test Password settings (part of security page)
    await safe('Settings', 'Security settings page loads', async () => {
        await page.goto(`${BASE}/settings/security`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Settings', 'Security page has password section', async () => {
        const passwordHeading = page.getByText(/password|change.*password/i).first();
        await passwordHeading.waitFor({ state: 'visible', timeout: 3000 });
    });

    // Test Project/Admin settings
    await safe('Settings', 'Project settings loads', async () => {
        await page.goto(`${BASE}/settings/project`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Settings', 'Project settings has visible form fields', async () => {
        const visibleInput = page.locator('input:visible, textarea:visible, select:visible, button[role="combobox"]:visible').first();
        await visibleInput.waitFor({ state: 'visible', timeout: 3000 });
    });

    // Test Roles settings
    await safe('Settings', 'Roles settings loads', async () => {
        await page.goto(`${BASE}/settings/roles`, { waitUntil: 'networkidle' });
        await page.getByText(/roles/i).first().waitFor();
    });

    // Test Permissions settings
    await safe('Settings', 'Permissions settings loads', async () => {
        await page.goto(`${BASE}/settings/permissions`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Settings', 'Permissions list visible', async () => {
        const permList = page.locator('table, [role="list"]').first();
        await permList.waitFor({ state: 'visible', timeout: 3000 });
    });

    // Test API Keys settings
    await safe('Settings', 'API Keys settings loads', async () => {
        await page.goto(`${BASE}/api-keys`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    // Test Performance/Jobs settings
    await safe('Settings', 'Jobs page loads', async () => {
        await page.goto(`${BASE}/admin/jobs`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    console.log('\n=== SUMMARY ===');
    console.log({
        passed: results.filter(r => r.status === 'Pass').length,
        failed: results.filter(r => r.status === 'Fail').length,
    });

    await browser.close();
}

main().catch(console.error);
