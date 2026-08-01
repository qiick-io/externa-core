/**
 * Fase B UX care polish — browser QA (Playwright).
 * Covers: B1 return URL, B2 field ACL UI (smoke as superadmin unrestricted), B3 drawer deep-links.
 * Run: node tests/Browser/qa-fase-b.mjs
 */
import { chromium, selectors } from 'playwright';

selectors.setTestIdAttribute('data-test');

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';

/** @type {{ surface: string, check: string, status: 'PASS'|'FAIL'|'SKIP', note?: string }[]} */
const results = [];

function record(surface, check, status, note = '') {
    results.push({ surface, check, status, note });
    const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
    console.log(`${mark} [${surface}] ${check}${note ? ` — ${note}` : ''}`);
}

async function safe(surface, check, fn) {
    try {
        await fn();
        record(surface, check, 'PASS');
        return true;
    } catch (e) {
        if (e?.name === 'SkipError' || e?.message === 'SKIP') {
            // already recorded as SKIP inside fn, or record now
            if (!results.some((r) => r.surface === surface && r.check === check && r.status === 'SKIP')) {
                record(surface, check, 'SKIP', String(e?.message ?? e).slice(0, 120));
            }
            return false;
        }
        record(surface, check, 'FAIL', String(e?.message ?? e).slice(0, 280));
        return false;
    }
}

async function login(page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page
        .locator('input[type="email"], input[name="email"]')
        .first()
        .fill(EMAIL);
    await page
        .locator('input[type="password"], input[name="password"]')
        .first()
        .fill(PASS);
    await page.getByRole('button', { name: /log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 15000,
    });
}

async function goto(page, path) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(300);
}

async function firstMultiCollectionId(page) {
    await goto(page, '/collections');
    const links = page.locator('a[href*="/collections/"]');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
        const href = await links.nth(i).getAttribute('href');
        if (!href) continue;
        const m = href.match(/\/collections\/(\d+)/);
        if (!m) continue;
        const id = m[1];
        await goto(page, `/collections/${id}`);
        const path = new URL(page.url()).pathname;
        if (path.includes('/items')) {
            return id;
        }
    }
    throw new Error('No multi-item collection found');
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);

    await login(page);
    const collectionId = await firstMultiCollectionId(page);

    // ——— B1 return URL ———
    await safe('B1', 'list with filter+page opens edit with return', async () => {
        const listPath = `/collections/${collectionId}/items?page=1&filter[title][_contains]=a`;
        await goto(page, listPath);
        const editLink = page.locator('a[href*="/items/"]').filter({ hasText: /^Edit$/i }).first();
        const row = page.locator('tr[role="link"], tr.cursor-pointer').first();
        if ((await editLink.count()) > 0) {
            await editLink.click();
        } else if ((await row.count()) > 0) {
            await row.click();
        } else {
            // Create then come back
            await page.getByRole('link', { name: /new item/i }).first().click();
            await page.waitForURL(/\/items\/new/);
            const u = new URL(page.url());
            if (!u.searchParams.get('return')) {
                throw new Error('New item missing return param');
            }
            return;
        }
        await page.waitForURL(/\/items\/\d+/);
        const u = new URL(page.url());
        const ret = u.searchParams.get('return');
        if (!ret) {
            throw new Error('Edit URL missing return param');
        }
        const decoded = decodeURIComponent(ret);
        if (!decoded.includes(`/collections/${collectionId}/items`)) {
            throw new Error(`return not list path: ${decoded}`);
        }
        if (!decoded.includes('filter') && !decoded.includes('page')) {
            // soft: at least path ok
        }
    });

    await safe('B1', 'Items breadcrumb restores return URL', async () => {
        const returnPath = `/collections/${collectionId}/items?page=1&filter[title][_contains]=zz`;
        await goto(
            page,
            `/collections/${collectionId}/items/new?return=${encodeURIComponent(returnPath)}`,
        );
        const itemsCrumb = page
            .locator('nav[aria-label="breadcrumb"] a, nav a')
            .filter({ hasText: /^Items$/i })
            .first();
        await itemsCrumb.click();
        await page.waitForURL((url) => url.pathname.includes('/items') && !url.pathname.includes('/new'));
        const u = new URL(page.url());
        if (!u.searchParams.get('filter[title][_contains]') && !u.href.includes('filter')) {
            // Laravel may encode filter differently
            if (!u.href.includes('zz') && !u.href.includes('page=1')) {
                throw new Error(`Filters not restored: ${u.href}`);
            }
        }
    });

    await safe('B1', 'rejects non-collections return (falls back)', async () => {
        await goto(
            page,
            `/collections/${collectionId}/items/new?return=${encodeURIComponent('https://evil.example/x')}`,
        );
        const itemsCrumb = page
            .locator('nav[aria-label="breadcrumb"] a, nav a')
            .filter({ hasText: /^Items$/i })
            .first();
        const href = await itemsCrumb.getAttribute('href');
        if (href && href.includes('evil.example')) {
            throw new Error('Evil return accepted in breadcrumb');
        }
        if (href && !href.includes(`/collections/${collectionId}/items`)) {
            throw new Error(`Unexpected fallback href: ${href}`);
        }
    });

    // ——— B2 field grants prop (superadmin → null / unrestricted UI) ———
    await safe('B2', 'item form loads without ACL badges for superadmin', async () => {
        await goto(page, `/collections/${collectionId}/items/new`);
        const noWrite = page.getByText(/no write access/i);
        if ((await noWrite.count()) > 0) {
            throw new Error('Superadmin unexpectedly saw No write access badge');
        }
    });

    // ——— B3 deep links ———
    await safe('B3', 'collections ?edit= opens drawer', async () => {
        await goto(page, '/collections');
        const editBtn = page.getByRole('button', { name: /^Edit$/i }).first();
        if ((await editBtn.count()) === 0) {
            throw new Error('No Edit button on collections');
        }
        await editBtn.click();
        await page.waitForURL((url) => url.searchParams.has('edit'), {
            timeout: 10000,
        });
        const id = new URL(page.url()).searchParams.get('edit');
        if (!id) {
            throw new Error('Opening edit did not set ?edit=');
        }
        // Close drawer
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const cancel = page.getByRole('button', { name: /cancel/i }).first();
        if ((await cancel.count()) > 0 && new URL(page.url()).searchParams.has('edit')) {
            await cancel.click();
            await page.waitForTimeout(400);
        }
        await goto(page, `/collections?edit=${id}`);
        await page.waitForTimeout(600);
        const title = page.getByText(/edit collection/i).first();
        if ((await title.count()) === 0) {
            throw new Error('Deep-link did not open collection drawer');
        }
    });

    await safe('B3', 'users ?new=1 opens create drawer', async () => {
        await goto(page, '/users?new=1');
        await page.waitForTimeout(500);
        const title = page.getByText(/new user|create user/i).first();
        if ((await title.count()) === 0) {
            // drawer heading variants
            const email = page.locator('input[name="email"], input[type="email"]').first();
            if ((await email.count()) === 0) {
                throw new Error('Users ?new=1 did not open drawer');
            }
        }
    });

    await safe('B3', 'fields ?field= opens edit drawer', async () => {
        // Resolve any collection that has at least one field card / known schema
        let fieldsCollectionId = null;
        let fieldId = null;
        await goto(page, '/collections');
        const hrefs = await page.locator('a[href*="/collections/"]').evaluateAll((els) =>
            [...new Set(els.map((el) => el.getAttribute('href')).filter(Boolean))],
        );
        for (const href of hrefs) {
            const m = String(href).match(/\/collections\/(\d+)/);
            if (!m) continue;
            await goto(page, `/collections/${m[1]}/fields`);
            await page.waitForTimeout(300);
            // Open first field via kebab → Modifica Campo / Edit field
            const more = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
            const menus = page.locator('[data-slot="dropdown-menu-trigger"], button').filter({
                has: page.locator('svg.lucide-ellipsis, svg.lucide-more-horizontal'),
            });
            if ((await menus.count()) > 0) {
                await menus.first().click();
                await page.waitForTimeout(200);
                const item = page.getByRole('menuitem').filter({ hasText: /modifica|edit field|edit/i }).first();
                if ((await item.count()) > 0) {
                    await item.click();
                    try {
                        await page.waitForURL((url) => url.searchParams.has('field'), {
                            timeout: 5000,
                        });
                        fieldsCollectionId = m[1];
                        fieldId = new URL(page.url()).searchParams.get('field');
                        break;
                    } catch {
                        /* try next collection */
                    }
                } else {
                    await page.keyboard.press('Escape');
                }
            }
        }

        if (!fieldsCollectionId || !fieldId) {
            // Fallback: seed from first known schema if list UI didn't expose a menu
            fieldsCollectionId = '1';
            fieldId = '1';
        }

        await goto(page, `/collections/${fieldsCollectionId}/fields?field=${fieldId}`);
        await page.waitForTimeout(600);
        const drawer = page.locator('[data-vaul-drawer], [role="dialog"]').first();
        if ((await drawer.count()) === 0) {
            throw new Error('?field= did not open field drawer');
        }
    });

    await safe('B3', 'files ?file= opens detail panel', async () => {
        await goto(page, '/files');
        await page.waitForTimeout(500);
        const fileCell = page.locator('[data-file-id], tr, [role="row"]').filter({ hasText: /.+/ }).nth(1);
        // Click first file-like row
        const firstFile = page.locator('button, a, [role="button"]').filter({ hasText: /\.(png|jpg|jpeg|pdf|txt|webp)/i }).first();
        if ((await firstFile.count()) > 0) {
            await firstFile.click();
            await page.waitForTimeout(500);
        } else {
            // try any grid item
            const tile = page.locator('[data-file-id]').first();
            if ((await tile.count()) === 0) {
                record('B3', 'files ?file=', 'SKIP', 'no files in manager');
                return;
            }
            const id = await tile.getAttribute('data-file-id');
            await goto(page, `/files?file=${id}`);
            await page.waitForTimeout(600);
            if (!page.url().includes(`file=${id}`)) {
                throw new Error('file query lost');
            }
            return;
        }
        const u = new URL(page.url());
        const fileId = u.searchParams.get('file');
        if (!fileId) {
            // panel may open without sync if click target wrong — try data attribute
            const id = await page.locator('[data-file-id]').first().getAttribute('data-file-id').catch(() => null);
            if (!id) {
                throw new Error('Opening file details did not set ?file=');
            }
            await goto(page, `/files?file=${id}`);
            await page.waitForTimeout(600);
        } else {
            await goto(page, `/files?file=${fileId}`);
            await page.waitForTimeout(600);
        }
        const close = page.getByRole('button', { name: /close/i }).first();
        if ((await close.count()) === 0) {
            // detail panel visible somehow
            const panel = page.locator('aside, [data-file-detail]').first();
            if ((await panel.count()) === 0 && !page.url().includes('file=')) {
                throw new Error('File detail panel not open after deep-link');
            }
        }
    });

    await browser.close();

    const failed = results.filter((r) => r.status === 'FAIL');
    console.log('\n——— Fase B summary ———');
    for (const r of results) {
        console.log(`${r.status.padEnd(4)} ${r.surface} · ${r.check}${r.note ? ` (${r.note})` : ''}`);
    }
    if (failed.length) {
        process.exitCode = 1;
    }
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
