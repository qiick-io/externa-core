/**
 * Remaining deep-QA gaps: revisions compare/restore, jobs monitor,
 * GraphQL smoke, blocks editor add/nested/save/reload.
 *
 * Run: node tests/Browser/qa-deep-admin-remaining.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';
const REV_COLLECTION = process.env.EXTERNA_REV_COLLECTION ?? '1';
const REV_ITEM = process.env.EXTERNA_REV_ITEM ?? '1';
const ARTICLES_ID = process.env.EXTERNA_ARTICLES_COLLECTION ?? '37';
const ARTICLES_ITEM = process.env.EXTERNA_ARTICLES_ITEM ?? '65';

/** @type {{ area: string, check: string, status: 'Pass'|'Fail'|'Fixed'|'Skipped', note?: string }[]} */
const results = [];

function record(area, check, status, note = '') {
    results.push({ area, check, status, note });
    const mark =
        status === 'Pass' ? '✓' : status === 'Fail' ? '✗' : status === 'Fixed' ? '✎' : '○';
    console.log(`${mark} [${area}] ${check}${note ? ` — ${note}` : ''}`);
}

async function safe(area, check, fn) {
    try {
        await fn();
        record(area, check, 'Pass');
        return true;
    } catch (e) {
        record(area, check, 'Fail', String(e?.message ?? e).slice(0, 320));
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

function itemUrl(collectionId, itemId) {
    return `${BASE}/collections/${collectionId}/items/${itemId}`;
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(25000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err.message).slice(0, 160)));
    // Auto-accept native confirms (restore / delete) — avoid "already handled" races
    page.on('dialog', async (dialog) => {
        try {
            await dialog.accept();
        } catch {
            // already handled
        }
    });

    await safe('Auth', 'Login as superadmin', () => login(page));

    // ——— GraphQL (HTTP; no browser needed beyond session) ———
    await safe('GraphQL', 'POST /api/graphql __typename', async () => {
        const res = await fetch(`${BASE}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ __typename }' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json?.data?.__typename !== 'Query') {
            throw new Error(`unexpected body ${JSON.stringify(json).slice(0, 200)}`);
        }
    });

    let gqlNote = '';
    await safe('GraphQL', 'Public role collections + posts items', async () => {
        const cols = await fetch(`${BASE}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'query { collections { slug } }' }),
        }).then((r) => r.json());
        if (cols?.errors?.length) throw new Error(JSON.stringify(cols.errors).slice(0, 200));
        const slugs = (cols?.data?.collections ?? []).map((c) => c.slug);
        if (!slugs.includes('posts')) throw new Error(`expected posts in ${slugs.join(',')}`);

        const items = await fetch(`${BASE}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'query { items(collection: "posts", perPage: 2) { data { id } meta { total } } }',
            }),
        }).then((r) => r.json());
        if (items?.errors?.length) throw new Error(JSON.stringify(items.errors).slice(0, 200));
        if (typeof items?.data?.items?.meta?.total !== 'number') {
            throw new Error(`bad items payload ${JSON.stringify(items).slice(0, 200)}`);
        }
        gqlNote = `collections=${slugs.join(',')} posts.total=${items.data.items.meta.total}`;
    });
    {
        const last = results.findLast(
            (r) => r.area === 'GraphQL' && r.check === 'Public role collections + posts items',
        );
        if (last && gqlNote) last.note = gqlNote;
    }

    await safe('GraphQL', 'Denied collection returns errors (not 500)', async () => {
        const res = await fetch(`${BASE}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'query { items(collection: "articles") { data { id } meta { total } } }',
            }),
        });
        if (res.status >= 500) throw new Error(`server error ${res.status}`);
        const json = await res.json();
        // articles should not be on public role — expect errors or empty denial
        const denied =
            res.status === 403 ||
            (Array.isArray(json?.errors) && json.errors.length > 0) ||
            json?.data?.items == null;
        if (!denied) {
            throw new Error(`expected denial, got ${JSON.stringify(json).slice(0, 240)}`);
        }
    });

    // ——— Jobs monitor ———
    await safe('Jobs', 'Settings → Jobs page loads', async () => {
        await page.goto(`${BASE}/settings/jobs`, { waitUntil: 'networkidle' });
        if (!page.url().includes('/settings/jobs')) {
            throw new Error(`unexpected url ${page.url()}`);
        }
        await page.getByRole('heading', { name: /pending/i }).first().waitFor();
        await page.getByRole('heading', { name: /failed jobs/i }).first().waitFor();
        const body = await page.locator('body').innerText();
        if (!/pending in queue/i.test(body) && !/Pending/i.test(body)) {
            throw new Error('jobs chrome missing pending copy');
        }
        // empty states are valid
        if (!/No pending jobs|No failed jobs|\bJob\b/i.test(body)) {
            throw new Error('neither empty-state nor job rows visible');
        }
    });

    await safe('Jobs', 'Nav click-path from settings layout', async () => {
        await page.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
        const jobsLink = page.getByRole('link', { name: /^jobs$/i }).first();
        if ((await jobsLink.count()) === 0) {
            // sidebar may use "Jobs" under settings nav
            const alt = page.locator('a[href*="/settings/jobs"]').first();
            if ((await alt.count()) === 0) throw new Error('no Jobs link in settings nav');
            await alt.click();
        } else {
            await jobsLink.click();
        }
        await page.waitForURL(/\/settings\/jobs/, { timeout: 10000 });
        await page.getByRole('heading', { name: /failed jobs/i }).first().waitFor();
    });

    // Seed a failed job so retry/delete path can be exercised when empty
    let jobsActionNote = '';
    await safe('Jobs', 'Failed job retry/delete actions', async () => {
        await page.goto(`${BASE}/settings/jobs`, { waitUntil: 'networkidle' });
        const body = await page.locator('body').innerText();
        if (/No failed jobs/i.test(body)) {
            throw new Error('expected seeded failed job; list empty');
        }
        const retry = page.getByRole('button', { name: /^retry$/i }).first();
        const del = page.getByRole('button', { name: /^delete$/i }).first();
        if ((await retry.count()) === 0 && (await del.count()) === 0) {
            throw new Error('failed rows present but no Retry/Delete actions');
        }
        // Delete seeded QA failure (avoid re-queue of bogus payload)
        if ((await del.count()) > 0) {
            await del.click();
            await page.waitForTimeout(1000);
            await page.waitForLoadState('networkidle');
            jobsActionNote = 'Deleted seeded failed job';
        } else {
            await retry.click();
            await page.waitForTimeout(1000);
            await page.waitForLoadState('networkidle');
            jobsActionNote = 'Clicked Retry on failed job';
        }
    });
    {
        const last = results.findLast(
            (r) => r.area === 'Jobs' && r.check === 'Failed job retry/delete actions',
        );
        if (last && jobsActionNote) last.note = jobsActionNote;
    }

    // ——— Revisions compare + restore ———
    let restoreMarker = `qa-rev-${Date.now()}`;
    await safe('Revisions', 'History page lists revisions + compare table', async () => {
        // Ensure ≥2 revisions by editing the item once if needed
        await page.goto(itemUrl(REV_COLLECTION, REV_ITEM), {
            waitUntil: 'networkidle',
        });
        const titleInput = page
            .locator('input[name="title"], input[name="title[en]"], input[id*="title"]')
            .first();
        if ((await titleInput.count()) > 0) {
            const current = await titleInput.inputValue().catch(() => '');
            restoreMarker = `${current || 'qa'} · ${Date.now()}`;
            await titleInput.fill(restoreMarker);
            await page.getByRole('button', { name: /^(save|update)$/i }).first().click();
            await page.waitForTimeout(1200);
            await page.waitForLoadState('networkidle');
        }

        await page.goto(
            `${BASE}/collections/${REV_COLLECTION}/items/${REV_ITEM}/revisions`,
            { waitUntil: 'networkidle' },
        );
        await page.getByRole('heading', { name: /^revisions$/i }).waitFor();
        await page.getByRole('heading', { name: /^compare$/i }).waitFor();
        const revButtons = page.locator('button', { hasText: /^#\d+/ });
        const count = await revButtons.count();
        if (count < 2) throw new Error(`need ≥2 revisions, found ${count}`);
        // Defaults select first two; compare table should show Field / A / B
        await page.getByRole('columnheader', { name: /^field$/i }).waitFor();
        await page.getByRole('columnheader', { name: /^a$/i }).waitFor();
        await page.getByRole('columnheader', { name: /^b$/i }).waitFor();
        const selected = page.getByText(/· selected/i);
        if ((await selected.count()) < 2) {
            // click two revisions explicitly
            await revButtons.nth(0).click();
            await revButtons.nth(1).click();
        }
        // toggle selection still works
        await revButtons.nth(Math.min(2, count - 1)).click();
        await page.getByRole('columnheader', { name: /^field$/i }).waitFor();
    });

    await safe('Revisions', 'Restore older revision', async () => {
        await page.goto(
            `${BASE}/collections/${REV_COLLECTION}/items/${REV_ITEM}/revisions`,
            { waitUntil: 'networkidle' },
        );
        const restoreBtns = page.getByRole('button', { name: /^restore$/i });
        const n = await restoreBtns.count();
        if (n < 1) throw new Error('no Restore buttons');
        // Restore the oldest listed (last in list) to force a visible change
        await restoreBtns.last().click();
        await page.waitForURL(
            (url) =>
                url.pathname.includes(`/items/${REV_ITEM}`) &&
                !url.pathname.includes('/revisions'),
            { timeout: 15000 },
        );
        // flash / body should indicate restore
        const body = await page.locator('body').innerText();
        if (!/revision restored|history|save|title/i.test(body)) {
            throw new Error('post-restore item page looks empty');
        }
    });

    // ——— Blocks editor ———
    const blockMarker = `QA block ${Date.now()}`;

    async function clickVisibleButton(nameRe) {
        const btn = page.getByRole('button', { name: nameRe }).locator('visible=true').last();
        if ((await btn.count()) === 0) {
            // fallback: any matching, force click
            const any = page.getByRole('button', { name: nameRe }).last();
            await any.click({ force: true });
            return;
        }
        await btn.click();
    }

    async function fillLastVisible(selector, value) {
        const visible = page.locator(`${selector} >> visible=true`).last();
        if ((await visible.count()) === 0) {
            // Locale tabs hide sibling inputs with .hidden — prefer :visible via evaluate
            const filled = await page.evaluate(
                ({ sel, val }) => {
                    const nodes = [...document.querySelectorAll(sel)].filter((el) => {
                        const style = window.getComputedStyle(el);
                        return (
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            el.offsetParent !== null
                        );
                    });
                    const el = nodes[nodes.length - 1];
                    if (!el) return false;
                    el.focus();
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                },
                { sel: selector, val: value },
            );
            if (!filled) throw new Error(`no visible input for ${selector}`);
            return;
        }
        await visible.fill(value);
    }

    await safe('Blocks', 'Add rich_text block + save', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), {
            waitUntil: 'networkidle',
        });
        await page.getByRole('button', { name: /^add rich text$/i }).first().waitFor({
            timeout: 15000,
        });
        await clickVisibleButton(/^add rich text$/i);
        await page.waitForTimeout(500);
        await fillLastVisible(
            'input[name*="[data][title]"]',
            blockMarker,
        );
        await page.getByRole('button', { name: /^(save|update)$/i }).first().click();
        await page.waitForTimeout(1500);
        await page.waitForLoadState('networkidle');
    });

    await safe('Blocks', 'Reload persists added block', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), {
            waitUntil: 'networkidle',
        });
        const body = await page.locator('body').innerText();
        if (!body.includes(blockMarker)) {
            const vals = await page
                .locator('input[name*="[data][title]"]')
                .evaluateAll((els) => els.map((e) => e.value));
            if (!vals.some((v) => String(v).includes(blockMarker))) {
                throw new Error(
                    `marker ${blockMarker} not found after reload; vals=${JSON.stringify(vals.slice(-8))}`,
                );
            }
        }
    });

    let nestedNote = '';
    await safe('Blocks', 'Add nested Section → inner Rich text', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), {
            waitUntil: 'networkidle',
        });
        if ((await page.getByRole('button', { name: /^add section$/i }).count()) === 0) {
            throw new Error('Add Section not available (nested blocks schema missing?)');
        }
        await clickVisibleButton(/^add section$/i);
        await page.waitForTimeout(500);
        // Nested Add Rich text appears inside the Section
        await clickVisibleButton(/^add rich text$/i);
        await page.waitForTimeout(400);
        const nestedMarker = `QA nested ${Date.now()}`;
        // Prefer title; section also has heading
        try {
            await fillLastVisible('input[name*="[data][title]"]', nestedMarker);
        } catch {
            await fillLastVisible('input[name*="[data][heading]"]', nestedMarker);
        }
        await page.getByRole('button', { name: /^(save|update)$/i }).first().click();
        await page.waitForTimeout(1500);
        await page.waitForLoadState('networkidle');
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), {
            waitUntil: 'networkidle',
        });
        const vals = await page
            .locator('input')
            .evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
        if (!vals.some((v) => String(v).includes(nestedMarker))) {
            const body = await page.locator('body').innerText();
            if (!body.includes(nestedMarker)) {
                throw new Error('nested marker missing after reload');
            }
        }
        nestedNote = `nested marker ${nestedMarker}`;
    });
    {
        const last = results.findLast(
            (r) => r.check === 'Add nested Section → inner Rich text',
        );
        if (last && nestedNote) last.note = nestedNote;
    }

    // Spot-check critical paths briefly
    await safe('Spot', 'Collections list + Articles items still load', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        const body = await page.locator('body').innerText();
        if (!/articles/i.test(body)) throw new Error('collections page missing Articles');
        await page.goto(`${BASE}/collections/${ARTICLES_ID}/items`, {
            waitUntil: 'networkidle',
        });
        const itemsBody = await page.locator('body').innerText();
        if (/403|forbidden/i.test(itemsBody) && !/item|article|title/i.test(itemsBody)) {
            throw new Error('articles items forbidden');
        }
    });

    await safe('Spot', 'No uncaught pageerrors this session', async () => {
        if (pageErrors.length) {
            throw new Error(pageErrors.slice(0, 3).join(' | '));
        }
    });

    const out = {
        at: new Date().toISOString(),
        base: BASE,
        results,
        summary: {
            pass: results.filter((r) => r.status === 'Pass').length,
            fail: results.filter((r) => r.status === 'Fail').length,
            fixed: results.filter((r) => r.status === 'Fixed').length,
            skipped: results.filter((r) => r.status === 'Skipped').length,
        },
    };
    writeFileSync(
        new URL('../../storage/app/qa-deep-admin-remaining-results.json', import.meta.url),
        JSON.stringify(out, null, 2),
    );
    console.log('\nSummary', out.summary);
    await browser.close();
    if (out.summary.fail > 0) process.exitCode = 1;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
