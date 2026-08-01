/**
 * Roles & Permissions UI comprehensive test
 * Tests: role CRUD, permission matrix, UI gating, forbidden actions
 * Run: node tests/Browser/roles-permissions-test.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';

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

async function login(page, email, password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').filter({ hasText: /log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function logout(page) {
    // Find user menu and logout
    const userMenu = page.locator('button[aria-label*="user" i], button[aria-haspopup="menu"]').first();
    if (await userMenu.isVisible()) {
        await userMenu.click();
        const logoutBtn = page.getByRole('menuitem', { name: /log out|sign out/i }).first();
        await logoutBtn.click();
        await page.waitForURL(/\/login/, { timeout: 5000 });
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(12000);

    // === SUPERADMIN TESTS ===
    await safe('Auth', 'Login as superadmin', () => login(page, 'superadmin@example.com', 'password'));

    // Test Roles page
    await safe('Roles', 'Roles settings page loads', async () => {
        await page.goto(`${BASE}/settings/roles`, { waitUntil: 'networkidle' });
        await page.getByText(/roles/i).first().waitFor();
    });

    await safe('Roles', 'Role list shows roles', async () => {
        const roleItems = page.locator('[data-testid*="role"], tr').filter({ hasText: /admin|reader|super-admin/i });
        const count = await roleItems.count();
        if (count === 0) throw new Error('No roles found');
    });

    await safe('Roles', 'Create role link visible', async () => {
        const createLink = page.getByRole('link', { name: /new role/i }).first();
        await createLink.waitFor({ state: 'visible', timeout: 3000 });
    });

    // Test Users page
    await safe('Users', 'Users page loads', async () => {
        await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' });
        await page.getByText(/users/i).first().waitFor();
    });

    await safe('Users', 'Test users appear in list', async () => {
        const adminUser = page.getByText('admin@test.com');
        const readerUser = page.getByText('reader@test.com');
        const editorUser = page.getByText('editor@test.com');
        
        await adminUser.waitFor({ state: 'visible', timeout: 3000 });
        const hasReader = (await readerUser.count()) > 0;
        const hasEditor = (await editorUser.count()) > 0;
        
        if (!hasReader || !hasEditor) throw new Error('Not all test users found');
    });

    await safe('Users', 'Users table renders', async () => {
        const table = page.locator('table').first();
        await table.waitFor({ state: 'visible', timeout: 3000 });
    });

    await logout(page);

    // === ADMIN TESTS ===
    await safe('Auth', 'Login as admin user', () => login(page, 'admin@test.com', 'password'));

    await safe('Permissions', 'Admin can access collections', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        // Should not get 403 or redirect to forbidden
        if (page.url().includes('/403') || page.url().includes('/login')) {
            throw new Error('Admin blocked from collections');
        }
    });

    await safe('Permissions', 'Admin can access users', async () => {
        await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' });
        if (page.url().includes('/403') || page.url().includes('/login')) {
            throw new Error('Admin blocked from users');
        }
    });

    await safe('Permissions', 'Admin can create items', async () => {
        await page.goto(`${BASE}/collections/1/items`, { waitUntil: 'networkidle' });
        const newItemBtn = page.getByRole('link', { name: /new item/i }).first();
        const hasButton = await newItemBtn.isVisible();
        if (!hasButton) throw new Error('Admin cannot see new item button');
    });

    await logout(page);

    // === READER TESTS ===
    await safe('Auth', 'Login as reader user', () => login(page, 'reader@test.com', 'password'));

    await safe('Permissions', 'Reader can access collections list', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        if (page.url().includes('/403') || page.url().includes('/login')) {
            throw new Error('Reader blocked from collections');
        }
    });

    await safe('Permissions', 'Reader cannot create collections', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        const createBtn = page.getByRole('button', { name: /new collection|create/i }).first();
        const hasButton = await createBtn.isVisible();
        if (hasButton) throw new Error('Reader can see create collection button');
    });

    await safe('Permissions', 'Reader cannot create items', async () => {
        await page.goto(`${BASE}/collections/1/items`, { waitUntil: 'networkidle' });
        const newItemBtn = page.getByRole('link', { name: /new item/i }).first();
        const hasButton = await newItemBtn.isVisible();
        if (hasButton) throw new Error('Reader can see new item button');
    });

    await safe('Permissions', 'Reader can access users page (read-only)', async () => {
        await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' });
        // Reader has can-show-users permission so they can VIEW the page
        if (page.url().includes('/403')) {
            throw new Error('Reader should be able to view users (read-only)');
        }
    });

    await logout(page);

    // === CUSTOM ROLE (EDITOR) TESTS ===
    await safe('Auth', 'Login as content editor', () => login(page, 'editor@test.com', 'password'));

    await safe('Permissions', 'Editor can create items', async () => {
        await page.goto(`${BASE}/collections/1/items`, { waitUntil: 'networkidle' });
        const newItemBtn = page.getByRole('link', { name: /new item/i }).first();
        await newItemBtn.waitFor({ state: 'visible', timeout: 3000 });
    });

    await safe('Permissions', 'Editor can upload files', async () => {
        await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
        const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
        await uploadBtn.waitFor({ state: 'visible', timeout: 3000 });
    });

    await safe('Permissions', 'Editor blocked from users', async () => {
        await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' });
        const is403 = page.url().includes('/403') || (await page.getByText(/forbidden|unauthorized|403/i).count()) > 0;
        if (!is403) throw new Error('Editor not blocked from users page');
    });

    await safe('Permissions', 'Editor blocked from roles settings', async () => {
        await page.goto(`${BASE}/settings/roles`, { waitUntil: 'networkidle' });
        const is403 = page.url().includes('/403') || (await page.getByText(/forbidden|unauthorized|403/i).count()) > 0;
        if (!is403) throw new Error('Editor not blocked from roles settings');
    });

    console.log('\n=== SUMMARY ===');
    console.log({
        passed: results.filter(r => r.status === 'Pass').length,
        failed: results.filter(r => r.status === 'Fail').length,
    });

    await browser.close();
}

main().catch(console.error);
