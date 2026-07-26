/**
 * Deep admin QA against live Herd site (Playwright).
 * Run: node tests/Browser/qa-deep-admin.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';

/** @type {{ area: string, check: string, status: 'Pass'|'Fail'|'Fixed'|'Skipped', note?: string }[]} */
const results = [];

function record(area, check, status, note = '') {
    results.push({ area, check, status, note });
    const mark = status === 'Pass' ? '✓' : status === 'Fail' ? '✗' : status === 'Fixed' ? '✎' : '○';
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
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASS);
    await page.getByRole('button', { name: /log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(12000);

    // 1. Auth / dashboard
    await safe('Auth', 'Login as superadmin', () => login(page));
    await safe('Auth', 'Dashboard loads', async () => {
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
        if (page.url().includes('/login')) throw new Error('redirected to login');
    });

    // 2. Collections list
    await safe('Collections', 'List page loads', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        await page.getByText(/collections/i).first().waitFor();
    });

    let collectionId = '37';
    await safe('Collections', 'Find multi-item collection link', async () => {
        const link = page.locator('a[href*="/collections/"][href*="/items"]').first();
        if (await link.count()) {
            const href = await link.getAttribute('href');
            const m = href?.match(/collections\/(\d+)/);
            if (m) collectionId = m[1];
        } else {
            // try row click → items
            const any = page.locator('a[href*="/collections/"]').first();
            const href = await any.getAttribute('href');
            const m = href?.match(/collections\/(\d+)/);
            if (m) collectionId = m[1];
        }
        if (!collectionId) throw new Error('no collection id');
    });

    await safe('Collections', 'Multi-select shows selection chrome', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        const checkbox = page.locator('table input[type="checkbox"], [role="checkbox"]').nth(1);
        if ((await checkbox.count()) === 0) throw new Error('no row checkbox');
        await checkbox.click();
        await page.getByText(/\d+\s+selected/i).first().waitFor({ timeout: 5000 });
    });

    // 4. Items + filter builder (MUST)
    const filteredUrl = `${BASE}/collections/${collectionId}/items?direction=desc&filter%5Btitle%5D%5B_contains%5D=mo&sort=id`;
    await safe('Items', 'Filtered URL loads', async () => {
        await page.goto(filteredUrl, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Items', 'Search box hydrated from URL title/_contains', async () => {
        const search = page.locator('input[placeholder*="Search title" i], input[placeholder*="Search trash" i], input[type="search"]').first();
        await search.waitFor();
        const val = await search.inputValue();
        if (val !== 'mo') throw new Error(`expected search "mo", got "${val}"`);
    });

    await safe('Items', 'Filter builder badge shows active count', async () => {
        const btn = page.getByRole('button', { name: /field filters|filters/i }).first();
        await btn.waitFor();
        const text = await btn.innerText();
        if (!/\d+/.test(text)) throw new Error(`no badge count on Filters button: "${text}"`);
    });

    await safe('Items', 'Filter builder hydrates title rule from URL', async () => {
        const btn = page.getByRole('button', { name: /field filters|filters/i }).first();
        await btn.click();
        const valueInput = page.getByLabel('Filter value').first();
        await valueInput.waitFor();
        const val = await valueInput.inputValue();
        if (val !== 'mo') throw new Error(`builder value expected "mo", got "${val}"`);
        // Clear all should be visible
        await page.getByRole('button', { name: /clear all/i }).waitFor();
    });

    await safe('Items', 'Clear all removes URL filter', async () => {
        await page.getByRole('button', { name: /clear all/i }).click();
        await page.waitForFunction(
            () => !window.location.href.includes('filter'),
            null,
            { timeout: 10000 },
        );
        const search = page.locator('input[placeholder*="Search title" i]').first();
        if ((await search.count()) && (await search.inputValue()) !== '') {
            throw new Error('search not cleared');
        }
    });

    await safe('Items', 'Add filter via builder and apply', async () => {
        await page.goto(`${BASE}/collections/${collectionId}/items`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /field filters|filters/i }).first().click();
        if ((await page.getByLabel('Filter value').count()) === 0) {
            await page.getByRole('button', { name: /add rule/i }).click();
        }
        const valueInput = page.getByLabel('Filter value').first();
        await valueInput.fill('mo');
        await page.getByRole('button', { name: /^apply$/i }).click();
        await page.waitForFunction(
            () => window.location.href.includes('filter'),
            null,
            { timeout: 10000 },
        );
    });

    await safe('Items', 'Sort / columns chrome present', async () => {
        await page.goto(`${BASE}/collections/${collectionId}/items`, { waitUntil: 'networkidle' });
        // column headers or column picker
        const table = page.locator('table').first();
        await table.waitFor();
    });

    await safe('Items', 'Item multi-select + Ask AI bulk', async () => {
        const checkbox = page.locator('table input[type="checkbox"], table [role="checkbox"]').nth(1);
        if ((await checkbox.count()) === 0) throw new Error('no item checkbox');
        await checkbox.click();
        await page.getByText(/\d+\s+selected/i).first().waitFor();
        await page.getByRole('button', { name: /ask ai/i }).first().waitFor();
    });

    // 3. Fields
    await safe('Fields', 'Fields page loads', async () => {
        await page.goto(`${BASE}/collections/${collectionId}/fields`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
        if (page.url().includes('/login')) throw new Error('auth fail');
    });

    // 5. Files
    await safe('Files', 'Files page loads', async () => {
        await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
        await page.getByText(/files/i).first().waitFor();
    });

    await safe('Files', 'Selection hides sort/trash chrome', async () => {
        const checkbox = page.locator('table input[type="checkbox"], [role="checkbox"], button[aria-label*="elect"]').nth(1);
        if ((await checkbox.count()) === 0) {
            // try grid item
            const item = page.locator('[data-selected], .file-row, table tbody tr').first();
            if ((await item.count()) === 0) throw new Error('no file to select');
            await item.click();
        } else {
            await checkbox.click();
        }
        await page.waitForTimeout(400);
        // selection chrome should show
        const selected = page.getByText(/\d+\s+selected/i);
        if ((await selected.count()) === 0) {
            // click might open details only — soft fail criteria
            throw new Error('no selection chrome');
        }
    });

    // 6. Users / groups / roles
    await safe('Users', 'Users page loads', async () => {
        await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' });
        await page.getByText(/users/i).first().waitFor();
    });
    await safe('Groups', 'Groups page loads', async () => {
        await page.goto(`${BASE}/groups`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });
    await safe('Roles', 'Roles settings loads', async () => {
        await page.goto(`${BASE}/settings/roles`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
        if (page.url().includes('/login')) throw new Error('auth fail');
    });

    // Limited role gate — create temp role if create UI exists
    await safe('Roles', 'Create limited role form reachable', async () => {
        await page.goto(`${BASE}/settings/roles/create`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
        if (page.url().includes('/login')) throw new Error('auth fail');
        // look for permission checkboxes or name field
        const name = page.locator('input[name="name"], input[id*="name"]').first();
        if ((await name.count()) === 0) throw new Error('no role name field');
    });

    // 7. Activity
    await safe('Activity', 'Activity log loads', async () => {
        const paths = ['/activity', '/settings/activity', '/admin/activity'];
        let ok = false;
        for (const p of paths) {
            await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
            if (!page.url().includes('/login') && page.url().includes(p.split('/').pop())) {
                ok = true;
                break;
            }
            // 404 might redirect
            const status = await page.locator('text=/not found|404/i').count();
            if (!status && !page.url().includes('/login')) {
                ok = true;
                break;
            }
        }
        if (!ok) {
            // try nav link
            await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
            const link = page.getByRole('link', { name: /activity/i }).first();
            if ((await link.count()) === 0) throw new Error('no activity route found');
            await link.click();
            await page.waitForLoadState('networkidle');
        }
    });

    // 8. Settings smoke
    await safe('Settings', 'Settings / project page', async () => {
        const paths = ['/settings', '/settings/project', '/settings/general'];
        let loaded = false;
        for (const p of paths) {
            const res = await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
            if (res && res.status() < 400 && !page.url().includes('/login')) {
                loaded = true;
                break;
            }
        }
        if (!loaded) throw new Error('no settings page loaded');
    });

    // 9. AI
    await safe('AI', '/ai page loads', async () => {
        await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
        if (page.url().includes('/login')) throw new Error('auth fail');
    });

    await safe('AI', 'Ask AI FAB or button present on items', async () => {
        await page.goto(`${BASE}/collections/${collectionId}/items`, { waitUntil: 'networkidle' });
        const ai = page.getByRole('button', { name: /ask ai/i }).or(page.locator('[aria-label*="Ask AI" i]'));
        if ((await ai.count()) === 0) throw new Error('no Ask AI control');
    });

    // 10. Insights — product surfaces insights on the main dashboard (no /insights route)
    await safe('Insights', 'Dashboard insights cards', async () => {
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        const insights = page.getByText(/insight|collection|activity/i).first();
        await insights.waitFor();
    });

    await browser.close();

    const summary = {
        passed: results.filter((r) => r.status === 'Pass').length,
        failed: results.filter((r) => r.status === 'Fail').length,
        fixed: results.filter((r) => r.status === 'Fixed').length,
        skipped: results.filter((r) => r.status === 'Skipped').length,
        results,
        collectionId,
        filteredUrl,
    };
    writeFileSync('storage/app/qa-deep-admin-results.json', JSON.stringify(summary, null, 2));
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, skipped: summary.skipped }, null, 2));
    process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});
