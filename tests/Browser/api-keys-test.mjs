/**
 * API Keys UI comprehensive test
 * Tests: create, list, revoke API keys
 * Run: node tests/Browser/api-keys-test.mjs
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

    await safe('API Keys', 'API keys page loads', async () => {
        await page.goto(`${BASE}/api-keys`, { waitUntil: 'networkidle' });
        await page.getByText(/api keys/i).first().waitFor({ timeout: 5000 });
    });

    await safe('API Keys', 'API keys table visible', async () => {
        const table = page.locator('table').first();
        await table.waitFor({ state: 'visible' });
    });

    await safe('API Keys', 'Create form visible on page', async () => {
        const form = page.locator('form').first();
        await form.waitFor({ state: 'visible' });
    });

    await safe('API Keys', 'Name input field visible', async () => {
        const nameInput = page.locator('input#api_key_name').first();
        await nameInput.waitFor({ state: 'visible' });
    });

    const testKeyName = 'Test API Key ' + Date.now();

    await safe('API Keys', 'Can fill in key name', async () => {
        const nameInput = page.locator('input#api_key_name').first();
        await nameInput.fill(testKeyName);
    });

    await safe('API Keys', 'Submit button visible', async () => {
        const submitBtn = page.getByRole('button', { name: /create api key/i }).first();
        await submitBtn.waitFor({ state: 'visible' });
    });

    let createdKeyId = null;

    await safe('API Keys', 'Create key successfully', async () => {
        const submitBtn = page.getByRole('button', { name: /create api key/i }).first();
        await submitBtn.click();
        await page.waitForTimeout(1500);
    });

    await safe('API Keys', 'Secret key banner appears', async () => {
        const secretBanner = page.locator('[data-testid="api-key-secret"]').first();
        await secretBanner.waitFor({ state: 'visible', timeout: 3000 });
    });

    await safe('API Keys', 'Key appears in table', async () => {
        const keyRow = page.locator('tr').filter({ hasText: new RegExp(testKeyName) }).first();
        await keyRow.waitFor({ state: 'visible', timeout: 3000 });
    });

    await safe('API Keys', 'Key shows as Active', async () => {
        const keyRow = page.locator('tr').filter({ hasText: new RegExp(testKeyName) }).first();
        const status = keyRow.locator('td').filter({ hasText: /active/i });
        await status.waitFor({ state: 'visible' });
    });

    await safe('API Keys', 'Revoke button visible', async () => {
        const keyRow = page.locator('tr').filter({ hasText: new RegExp(testKeyName) }).first();
        const revokeBtn = keyRow.getByRole('button').first();
        await revokeBtn.waitFor({ state: 'visible' });
    });

    await safe('API Keys', 'Click revoke opens dialog', async () => {
        const keyRow = page.locator('tr').filter({ hasText: new RegExp(testKeyName) }).first();
        const revokeBtn = keyRow.getByRole('button').first();
        await revokeBtn.click();
        await page.waitForTimeout(500);
        
        const dialog = page.getByRole('dialog').first();
        await dialog.waitFor({ state: 'visible', timeout: 3000 });
    });

    await safe('API Keys', 'Confirm revoke button visible', async () => {
        const confirmBtn = page.getByRole('button', { name: /revoke/i }).last();
        await confirmBtn.waitFor({ state: 'visible' });
    });

    await safe('API Keys', 'Key marked as revoked after confirmation', async () => {
        const confirmBtn = page.getByRole('button', { name: /revoke/i }).last();
        await confirmBtn.click();
        await page.waitForTimeout(1500);
        
        // Key should now show as Revoked
        const keyRow = page.locator('tr').filter({ hasText: new RegExp(testKeyName) }).first();
        const status = keyRow.locator('td').filter({ hasText: /revoked/i });
        await status.waitFor({ state: 'visible', timeout: 3000 });
    });

    console.log('\n=== SUMMARY ===');
    console.log({
        passed: results.filter(r => r.status === 'Pass').length,
        failed: results.filter(r => r.status === 'Fail').length,
    });

    await browser.close();
}

main().catch(console.error);
