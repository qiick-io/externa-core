/**
 * Fase C UX care polish — browser QA (Playwright).
 * Covers: C1 where-used, C2 preview as role, C3 autosave draft, C4 health badge, C5 activity strip.
 * Run: node tests/Browser/qa-fase-c.mjs
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
        if (String(e?.message ?? e) === 'SKIP') {
            record(surface, check, 'SKIP');
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
    await page.waitForTimeout(400);
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

async function openFirstItemEdit(page, collectionId) {
    await goto(page, `/collections/${collectionId}/items`);
    const editLink = page
        .locator('a[href*="/items/"]')
        .filter({ hasText: /^Edit$/i })
        .first();
    const row = page.locator('tr[role="link"], tr.cursor-pointer').first();
    if ((await editLink.count()) > 0) {
        await editLink.click();
    } else if ((await row.count()) > 0) {
        await row.click();
    } else {
        throw new Error('No item to edit');
    }
    await page.waitForURL(/\/items\/\d+/, { timeout: 15000 });
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);

    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    await login(page);
    const collectionId = await firstMultiCollectionId(page);

    // ——— C4 health tab (sidebar badge removed; deep-link only) ———
    await safe('C4', 'dashboard health tab via deep-link', async () => {
        await goto(page, '/dashboard?tab=health');
        await page.getByTestId('dashboard-health').waitFor({
            state: 'visible',
            timeout: 10000,
        });
    });

    // ——— C5 activity strip ———
    await safe('C5', 'item form shows activity strip', async () => {
        await openFirstItemEdit(page, collectionId);
        await page.getByTestId('item-activity-strip').waitFor({
            state: 'visible',
            timeout: 10000,
        });
        const revisions = page
            .getByTestId('item-activity-strip')
            .getByRole('link', { name: /revisions/i });
        if ((await revisions.count()) < 1) {
            throw new Error('missing Revisions link');
        }
    });

    // ——— C2 preview as role ———
    await safe('C2', 'preview as role dialog returns JSON', async () => {
        if (!page.url().includes('/items/')) {
            await openFirstItemEdit(page, collectionId);
        }
        const btn = page.getByTestId('preview-as-role');
        await btn.waitFor({ state: 'visible', timeout: 10000 });
        await btn.click();
        await page.getByTestId('preview-as-role-dialog').waitFor({
            state: 'visible',
        });
        await page.getByTestId('preview-as-role-run').click();
        await page.getByTestId('preview-as-role-result').waitFor({
            state: 'visible',
            timeout: 15000,
        });
        await page
            .getByTestId('preview-as-role-close')
            .click();
    });

    // ——— C3 autosave draft ———
    await safe('C3', 'typing stores draft and shows restore banner', async () => {
        await openFirstItemEdit(page, collectionId);
        const url = page.url();
        const itemMatch = url.match(/\/items\/(\d+)/);
        if (!itemMatch) throw new Error('no item id');

        const textInput = page
            .locator(
                '#collection-item-form input[name^="data"]:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), #collection-item-form textarea[name^="data"]',
            )
            .first();
        if ((await textInput.count()) < 1) {
            throw new Error('SKIP');
        }
        await textInput.waitFor({ state: 'visible', timeout: 5000 });

        const original = await textInput.inputValue().catch(() => '');
        const marker = `draft-qa-${Date.now()}`;
        await textInput.fill(marker);
        await page.waitForTimeout(1200);

        const draftKey = await page.evaluate(
            ({ cid, iid }) =>
                localStorage.getItem(`externa:item-draft:${cid}:${iid}`),
            { cid: collectionId, iid: itemMatch[1] },
        );
        if (!draftKey || !draftKey.includes(marker)) {
            throw new Error('draft not written to localStorage');
        }

        await goto(page, url);
        const banner = page.getByTestId('item-draft-banner');
        await banner.waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('discard-item-draft').click();
        await page.waitForTimeout(300);
        if (await banner.isVisible().catch(() => false)) {
            throw new Error('banner still visible after discard');
        }
        if (original !== undefined) {
            await textInput.fill(original).catch(() => {});
        }
    });

    // ——— C1 where-used ———
    await safe('C1', 'file detail panel shows where-used section', async () => {
        await goto(page, '/files');
        // Prefer opening via deep-link if we can find a file id from list API
        const listRes = await page.request.get(`${BASE}/files/list`);
        if (!listRes.ok()) {
            throw new Error('files list failed');
        }
        const body = await listRes.json();
        const file = (body.data ?? []).find((f) => f.type === 'file');
        if (!file) {
            throw new Error('SKIP');
        }
        await goto(page, `/files?file=${file.id}`);
        await page.getByTestId('file-where-used').waitFor({
            state: 'visible',
            timeout: 15000,
        });
        // either "Not referenced" or a count line
        const text = await page.getByTestId('file-where-used').innerText();
        if (
            !/not referenced|reference|scanning/i.test(text) &&
            text.trim() === ''
        ) {
            throw new Error(`unexpected where-used copy: ${text.slice(0, 80)}`);
        }
    });

    await safe('C1', 'where-used API returns count + references', async () => {
        const listRes = await page.request.get(`${BASE}/files/list`);
        const body = await listRes.json();
        const file = (body.data ?? []).find((f) => f.type === 'file');
        if (!file) {
            throw new Error('SKIP');
        }
        const wu = await page.request.get(`${BASE}/files/${file.id}/where-used`);
        if (!wu.ok()) {
            throw new Error(`where-used HTTP ${wu.status()}`);
        }
        const json = await wu.json();
        if (typeof json.count !== 'number' || !Array.isArray(json.references)) {
            throw new Error('bad where-used payload');
        }
    });

    const relevantErrors = consoleErrors.filter(
        (t) =>
            !/favicon|Download the React DevTools|hydration/i.test(t) &&
            !/Failed to load resource/i.test(t),
    );
    await safe('console', 'no critical console errors', async () => {
        if (relevantErrors.length > 0) {
            throw new Error(relevantErrors.slice(0, 3).join(' | '));
        }
    });

    await browser.close();

    const failed = results.filter((r) => r.status === 'FAIL');
    const passed = results.filter((r) => r.status === 'PASS');
    const skipped = results.filter((r) => r.status === 'SKIP');
    console.log(
        `\nFase C QA: ${passed.length} PASS, ${failed.length} FAIL, ${skipped.length} SKIP`,
    );
    if (failed.length > 0) {
        process.exitCode = 1;
    }
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
