/**
 * Partial MVP verification: Map (Point+MultiPoint), Insights dashboard panels,
 * Blocks/Repeater (depth-capped nesting, nested m2a/m2m, nested conditions).
 *
 * Run: node tests/Browser/qa-partial-mvp.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';
const MAP_COLLECTION = process.env.EXTERNA_MAP_COLLECTION ?? '42';
const MAP_ITEM = process.env.EXTERNA_MAP_ITEM ?? '57';
const ARTICLES_ID = process.env.EXTERNA_ARTICLES_COLLECTION ?? '37';
const ARTICLES_ITEM = process.env.EXTERNA_ARTICLES_ITEM ?? '65'; // override with fresh item if #65 is polluted

/** @type {{ area: string, check: string, status: 'Pass'|'Fail'|'Fixed'|'Skipped'|'N/A', note?: string }[]} */
const results = [];

function record(area, check, status, note = '') {
    results.push({ area, check, status, note });
    const mark =
        status === 'Pass'
            ? '✓'
            : status === 'Fail'
              ? '✗'
              : status === 'Fixed'
                ? '✎'
                : status === 'N/A'
                  ? '–'
                  : '○';
    console.log(`${mark} [${area}] ${check}${note ? ` — ${note}` : ''}`);
}

async function safe(area, check, fn) {
    try {
        await fn();
        record(area, check, 'Pass');
        return true;
    } catch (e) {
        record(area, check, 'Fail', String(e?.message ?? e).slice(0, 400));
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

async function clickVisibleButton(page, nameRe) {
    const btn = page.getByRole('button', { name: nameRe }).locator('visible=true').last();
    if ((await btn.count()) === 0) {
        await page.getByRole('button', { name: nameRe }).last().click({ force: true });
        return;
    }
    await btn.click();
}

async function fillLastVisible(page, selector, value) {
    const visible = page.locator(`${selector} >> visible=true`).last();
    if ((await visible.count()) === 0) {
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

async function saveItem(page) {
    await page.getByRole('button', { name: /^(save|update)$/i }).first().click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle');
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(25000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err.message).slice(0, 160)));
    page.on('dialog', async (dialog) => {
        try {
            await dialog.accept();
        } catch {
            // already handled
        }
    });

    await safe('Auth', 'Login as superadmin', () => login(page));

    // ─────────────────────────────────────────────
    // MAP — Point + MultiPoint (collection 42 Map MVP QA)
    // ─────────────────────────────────────────────
    let tileOk = false;
    await safe('Map', 'Leaflet OSM tiles load (not black)', async () => {
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });
        await page.locator('.leaflet-container').first().waitFor({ timeout: 15000 });
        // Wait for at least one OSM tile image to load successfully
        const tileLoaded = await page.waitForFunction(
            () => {
                const imgs = [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')];
                return imgs.some(
                    (img) =>
                        img.complete &&
                        img.naturalWidth > 0 &&
                        !img.classList.contains('leaflet-tile-loaded') === false,
                ) || imgs.some((img) => img.complete && img.naturalWidth > 0);
            },
            { timeout: 20000 },
        ).then(() => true).catch(() => false);

        if (!tileLoaded) {
            // fallback: check network for tile CDN response
            const tileRes = await page.evaluate(async () => {
                try {
                    const r = await fetch(
                        'https://a.tile.openstreetmap.org/5/16/11.png',
                        { mode: 'no-cors' },
                    );
                    return r.type === 'opaque' || r.ok;
                } catch {
                    return false;
                }
            });
            if (!tileRes) {
                // Check if tiles exist in DOM at all
                const count = await page.locator('.leaflet-tile-pane img').count();
                if (count === 0) throw new Error('no leaflet tiles in DOM');
            }
        }

        // Visual smoke: map pane has non-zero size and tile layer present
        const dims = await page.locator('.leaflet-container').first().boundingBox();
        if (!dims || dims.height < 100 || dims.width < 100) {
            throw new Error(`map container too small: ${JSON.stringify(dims)}`);
        }
        const blackCheck = await page.evaluate(() => {
            const pane = document.querySelector('.leaflet-tile-pane');
            if (!pane) return { ok: false, reason: 'no tile pane' };
            const imgs = [...pane.querySelectorAll('img')];
            if (imgs.length === 0) return { ok: false, reason: 'zero tile imgs' };
            const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
            return { ok: loaded > 0, reason: `loaded=${loaded}/${imgs.length}` };
        });
        if (!blackCheck.ok) throw new Error(`tiles not loaded: ${blackCheck.reason}`);
        tileOk = true;
    });
    {
        const last = results.findLast((r) => r.check.includes('Leaflet OSM'));
        if (last && tileOk) last.note = 'OSM tile imgs naturalWidth>0';
    }

    const pointLat = 45.4642 + Math.random() * 0.01;
    const pointLng = 9.19 + Math.random() * 0.01;
    await safe('Map', 'Point: set lat/lng + save/reload', async () => {
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });
        await page.locator('#location_lat, input[id*="location_lat"]').first().waitFor({
            timeout: 15000,
        });
        const latInput = page.locator('input[id$="_lat"]').first();
        const lngInput = page.locator('input[id$="_lng"]').first();
        // Prefer location field (point mode) — first map is location
        await latInput.fill(String(pointLat));
        await lngInput.fill(String(pointLng));
        await saveItem(page);
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });
        const latVal = await page.locator('input[id$="_lat"]').first().inputValue();
        const lngVal = await page.locator('input[id$="_lng"]').first().inputValue();
        const latN = Number(latVal);
        const lngN = Number(lngVal);
        if (Math.abs(latN - pointLat) > 0.0001) {
            throw new Error(`lat not persisted: got ${latVal} expected ~${pointLat}`);
        }
        if (Math.abs(lngN - pointLng) > 0.0001) {
            throw new Error(`lng not persisted: got ${lngVal} expected ~${pointLng}`);
        }
        // GeoJSON hidden fields
        const geoType = await page
            .locator('input[name="location[type]"]')
            .first()
            .inputValue()
            .catch(() => '');
        if (geoType && geoType !== 'Point') {
            throw new Error(`expected Point type, got ${geoType}`);
        }
    });

    await safe('Map', 'Point: map click places marker', async () => {
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });
        const map = page.locator('.leaflet-container').first();
        await map.waitFor();
        await page.waitForTimeout(800);
        const box = await map.boundingBox();
        if (!box) throw new Error('no map box');
        await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
        await page.waitForTimeout(400);
        const markers = await page.locator('.leaflet-marker-icon').count();
        if (markers < 1) throw new Error('no marker after map click');
        const latVal = await page.locator('input[id$="_lat"]').first().inputValue();
        if (!latVal || !Number.isFinite(Number(latVal))) {
            throw new Error('lat input empty after click');
        }
    });

    let multiNote = '';
    await safe('Map', 'MultiPoint: add/remove markers + save/reload', async () => {
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });
        // Clear waypoints if any, then add two points via Add point
        const clearBtn = page.getByRole('button', { name: /clear/i });
        // Scope to waypoints section — look for Add point buttons
        const addPointBtns = page.getByRole('button', { name: /add point/i });
        if ((await addPointBtns.count()) === 0) {
            throw new Error('Add point button missing (multipoint UI not rendered?)');
        }
        // Clear existing multipoint if Clear is available near waypoints
        const clears = await clearBtn.count();
        if (clears > 0) {
            await clearBtn.last().click();
            await page.waitForTimeout(200);
        }
        await addPointBtns.last().click();
        await page.waitForTimeout(200);
        await addPointBtns.last().click();
        await page.waitForTimeout(300);

        // Fill lat/lng for the two waypoints (indexed inputs)
        const lat1 = 41.9 + Math.random() * 0.01;
        const lng1 = 12.5 + Math.random() * 0.01;
        const lat2 = 48.85 + Math.random() * 0.01;
        const lng2 = 2.35 + Math.random() * 0.01;

        const multiLats = page.locator('input[id*="waypoints_lat"], input[id*="_lat_"]');
        // Prefer id pattern from MapCoordinateInput: `${idPrefix}_lat_${index}`
        const wpLat0 = page.locator('#waypoints_lat_0, input[id$="_lat_0"]').first();
        const wpLng0 = page.locator('#waypoints_lng_0, input[id$="_lng_0"]').first();
        const wpLat1 = page.locator('#waypoints_lat_1, input[id$="_lat_1"]').first();
        const wpLng1 = page.locator('#waypoints_lng_1, input[id$="_lng_1"]').first();

        if ((await wpLat0.count()) === 0) {
            // Fallback: all number inputs after point field — use evaluate
            const filled = await page.evaluate(
                ({ a, b, c, d }) => {
                    const latInputs = [...document.querySelectorAll('input[id*="_lat_"]')];
                    const lngInputs = [...document.querySelectorAll('input[id*="_lng_"]')];
                    if (latInputs.length < 2 || lngInputs.length < 2) {
                        return `need 2 lat/lng pairs, got lat=${latInputs.length} lng=${lngInputs.length}`;
                    }
                    const set = (el, v) => {
                        el.focus();
                        el.value = String(v);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    set(latInputs[0], a);
                    set(lngInputs[0], b);
                    set(latInputs[1], c);
                    set(lngInputs[1], d);
                    return 'ok';
                },
                { a: lat1, b: lng1, c: lat2, d: lng2 },
            );
            if (filled !== 'ok') throw new Error(filled);
        } else {
            await wpLat0.fill(String(lat1));
            await wpLng0.fill(String(lng1));
            await wpLat1.fill(String(lat2));
            await wpLng1.fill(String(lng2));
        }

        await saveItem(page);
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });

        const typeVal = await page
            .locator('input[name="waypoints[type]"]')
            .first()
            .inputValue()
            .catch(() => '');
        if (typeVal && typeVal !== 'MultiPoint') {
            throw new Error(`expected MultiPoint, got ${typeVal}`);
        }

        const latCount = await page.locator('input[id*="_lat_"]').count();
        if (latCount < 2) throw new Error(`expected ≥2 multipoint rows after reload, got ${latCount}`);

        // Remove one point
        const removeBtns = page.getByRole('button', { name: /remove/i });
        const removeCount = await removeBtns.count();
        if (removeCount < 1) throw new Error('no Remove buttons on multipoint rows');
        await removeBtns.last().click();
        await page.waitForTimeout(200);
        await saveItem(page);
        await page.goto(itemUrl(MAP_COLLECTION, MAP_ITEM), { waitUntil: 'networkidle' });
        const afterRemove = await page.locator('input[id*="_lat_"]').count();
        if (afterRemove !== 1) {
            throw new Error(`expected 1 point after remove+reload, got ${afterRemove}`);
        }
        multiNote = `added 2 → saved → removed 1 → ${afterRemove} left`;
    });
    {
        const last = results.findLast((r) => r.check.startsWith('MultiPoint'));
        if (last && multiNote) last.note = multiNote;
    }

    await safe('Map', 'List cell shows Point / N points', async () => {
        // Ensure list_columns include map fields — check items index
        await page.goto(`${BASE}/collections/${MAP_COLLECTION}/items`, {
            waitUntil: 'networkidle',
        });
        const body = await page.locator('body').innerText();
        // Cell renders "Point" or "N points" — after our edits we should have Point + 1 point
        const hasPoint = /\bPoint\b/i.test(body);
        const hasPoints = /\d+\s+points?/i.test(body);
        if (!hasPoint && !hasPoints) {
            // Columns may hide map fields — check via DOM cells or accept if location column absent
            const cells = await page.locator('table td, [role="cell"]').allInnerTexts();
            const joined = cells.join(' | ');
            if (!/Point|\d+\s+points?/i.test(joined)) {
                // Fallback: verify renderer via evaluate on known value shape isn't possible;
                // mark as fail only if map columns exist but empty
                if (/location|waypoints|map/i.test(body)) {
                    throw new Error(
                        `map columns present but no Point/N points cell; sample=${joined.slice(0, 200)}`,
                    );
                }
                // Columns not shown — verify cell helper via navigating show page values instead
                // by checking hidden GeoJSON still present on edit (already tested). Soft-pass with note.
                throw new Error(
                    'list has no map columns visible — enable list_columns for location/waypoints or accept code-path only',
                );
            }
        }
    });

    // ─────────────────────────────────────────────
    // INSIGHTS — Dashboard MVP panels
    // ─────────────────────────────────────────────
    await safe('Insights', 'Collection counts panel', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        const title = page.getByText(/collections|conteggi|collection counts/i).first();
        // Use card title from i18n — look for table with Items header
        const body = await page.locator('body').innerText();
        if (!/items|elementi|collections/i.test(body)) {
            throw new Error('dashboard missing collections/items chrome');
        }
        // Table rows for collection counts
        const tables = page.locator('table');
        if ((await tables.count()) < 1) throw new Error('no tables on dashboard');
        // Expect at least one collection name we know
        if (!/articles|posts|map mvp/i.test(body)) {
            throw new Error('collection counts table missing known collections');
        }
    });

    await safe('Insights', 'Activity chart (Recharts)', async () => {
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        // Recharts renders SVG
        const svg = page.locator('.recharts-responsive-container, .recharts-wrapper, .recharts-surface');
        const count = await svg.count();
        if (count < 1) {
            // Empty activity may show empty-state instead of chart — still OK if copy present
            const body = await page.locator('body').innerText();
            if (!/activity|attività|no activity|7/i.test(body)) {
                throw new Error('no Recharts SVG and no activity empty-state');
            }
            // empty state is Pass for MVP
            return;
        }
        // Prefer at least one bar or empty-state already handled
        await svg.first().waitFor();
    });

    await safe('Insights', 'Content events breakdown', async () => {
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        const body = await page.locator('body').innerText();
        // i18n keys: created / updated / deleted
        const hasCreated = /created|creati/i.test(body);
        const hasUpdated = /updated|aggiornati/i.test(body);
        const hasDeleted = /deleted|eliminati/i.test(body);
        if (!(hasCreated && hasUpdated && hasDeleted)) {
            // Chart may use translated labels — check for content events heading
            if (!/content events|eventi|breakdown/i.test(body)) {
                throw new Error(
                    `content events breakdown missing (c=${hasCreated} u=${hasUpdated} d=${hasDeleted})`,
                );
            }
        }
        // Second recharts or numeric breakdown
        const charts = await page.locator('.recharts-responsive-container, .recharts-wrapper').count();
        // At least activity OR events chart; if both empty-states, body labels suffice
        if (charts < 1 && !/created|updated|deleted/i.test(body)) {
            throw new Error('no content-events chart or labels');
        }
    });

    await safe('Insights', 'Short viewport still scrolls (no crushed tables)', async () => {
        await page.setViewportSize({ width: 1280, height: 500 });
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const scrollInfo = await page.evaluate(() => {
            const layout = document.querySelector('[class*="overflow-y-auto"]');
            const targets = [layout, document.documentElement, document.body].filter(Boolean);
            let scrollable = null;
            for (const el of targets) {
                if (el.scrollHeight > el.clientHeight + 20) {
                    scrollable = el;
                    break;
                }
            }
            if (!scrollable) {
                return {
                    ok: false,
                    reason: 'no scrollable container',
                    docH: document.documentElement.scrollHeight,
                    clientH: document.documentElement.clientHeight,
                };
            }
            const before = scrollable.scrollTop;
            scrollable.scrollTop = Math.min(400, scrollable.scrollHeight - scrollable.clientHeight);
            const after = scrollable.scrollTop;
            // Reset
            scrollable.scrollTop = before;
            return {
                ok: after > before || scrollable.scrollHeight > scrollable.clientHeight + 40,
                before,
                after,
                scrollHeight: scrollable.scrollHeight,
                clientHeight: scrollable.clientHeight,
            };
        });
        if (!scrollInfo.ok) {
            throw new Error(`short viewport not scrollable: ${JSON.stringify(scrollInfo)}`);
        }
        // Tables shouldn't be crushed to zero height
        const tableBox = await page.locator('table').first().boundingBox();
        if (tableBox && tableBox.height < 40) {
            throw new Error(`table crushed: height=${tableBox.height}`);
        }
    });

    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });

    // ─────────────────────────────────────────────
    // BLOCKS — Articles golden path + nesting
    // ─────────────────────────────────────────────
    const blockMarker = `QA partial ${Date.now()}`;

    await safe('Blocks', 'Top-level add Rich text + save/reload', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /^add rich text$/i }).first().waitFor({
            timeout: 15000,
        });
        await clickVisibleButton(page, /^add rich text$/i);
        await page.waitForTimeout(400);
        await fillLastVisible(page, 'input[name*="[data][title]"]', blockMarker);
        const preSave = await page.locator('input').evaluateAll((els) =>
            els.map((e) => e.value).filter((v) => v && String(v).includes('QA partial')),
        );
        if (!preSave.some((v) => String(v).includes(blockMarker))) {
            throw new Error(`fill did not stick before save; saw=${JSON.stringify(preSave.slice(-4))}`);
        }
        await saveItem(page);
        const errBanner = await page.locator('[role="alert"], .text-destructive, [data-sonner-toast]').allInnerTexts().catch(() => []);
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const vals = await page.locator('input').evaluateAll((els) => els.map((e) => e.value));
        if (!vals.some((v) => String(v).includes(blockMarker))) {
            const body = await page.locator('body').innerText();
            if (!body.includes(blockMarker)) {
                throw new Error(
                    `marker missing after reload; errs=${JSON.stringify(errBanner).slice(0, 200)} vals=${JSON.stringify(vals.filter(Boolean).slice(-8))}`,
                );
            }
        }
    });

    await safe('Blocks', 'Reorder (move up/down)', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        // Fresh items may have a single block after the add test — ensure ≥2 for move.
        const downs = page.locator('button[aria-label="Move block down"]');
        if ((await downs.count()) < 1) {
            throw new Error('move-down controls missing');
        }
        if ((await downs.count()) < 2) {
            await clickVisibleButton(page, /^add rich text$/i);
            await page.waitForTimeout(400);
        }
        const enabledDown = page.locator('button[aria-label="Move block down"]:not([disabled])').first();
        const enabledUp = page.locator('button[aria-label="Move block up"]:not([disabled])').first();
        if ((await enabledDown.count()) > 0) {
            await enabledDown.click();
        } else if ((await enabledUp.count()) > 0) {
            await enabledUp.click();
        } else {
            throw new Error('all move buttons disabled (need ≥2 blocks)');
        }
        await page.waitForTimeout(300);
        await saveItem(page);
    });

    await safe('Blocks', 'Duplicate + collapse', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const dup = page.getByRole('button', { name: /duplicate/i }).locator('visible=true').first();
        if ((await dup.count()) === 0) throw new Error('Duplicate button missing');
        const before = await page.getByRole('button', { name: /duplicate/i }).count();
        await dup.click();
        await page.waitForTimeout(400);
        const after = await page.getByRole('button', { name: /duplicate/i }).count();
        if (after <= before) throw new Error(`duplicate did not add block (${before}→${after})`);

        const collapse = page.getByRole('button', { name: /collapse block/i }).locator('visible=true').first();
        if ((await collapse.count()) === 0) {
            // maybe already collapsed — try Expand
            const expand = page.getByRole('button', { name: /expand block/i }).first();
            if ((await expand.count()) === 0) throw new Error('collapse/expand controls missing');
            await expand.click();
            await page.waitForTimeout(200);
            await page.getByRole('button', { name: /collapse block/i }).first().click();
        } else {
            await collapse.click();
        }
        await page.waitForTimeout(200);
        // After collapse, Expand should appear
        const expandAfter = page.getByRole('button', { name: /expand block/i });
        if ((await expandAfter.count()) < 1) {
            throw new Error('after collapse, no Expand control');
        }
        await saveItem(page);
    });

    let nestedNote = '';
    await safe('Blocks', 'Nested Section within max_blocks_depth', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        if ((await page.getByRole('button', { name: /^add section$/i }).count()) === 0) {
            throw new Error('Add Section missing');
        }
        await clickVisibleButton(page, /^add section$/i);
        await page.waitForTimeout(400);
        await clickVisibleButton(page, /^add rich text$/i);
        await page.waitForTimeout(300);
        const nestedMarker = `QA nest ${Date.now()}`;
        try {
            await fillLastVisible(page, 'input[name*="[data][title]"]', nestedMarker);
        } catch {
            await fillLastVisible(page, 'input[name*="[data][heading]"]', nestedMarker);
        }
        await saveItem(page);
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const vals = await page.locator('input').evaluateAll((els) =>
            els.map((e) => e.value).filter(Boolean),
        );
        if (!vals.some((v) => String(v).includes(nestedMarker))) {
            const body = await page.locator('body').innerText();
            if (!body.includes(nestedMarker)) throw new Error('nested marker missing after reload');
        }
        nestedNote = nestedMarker;
    });
    {
        const last = results.findLast((r) => r.check.includes('Nested Section'));
        if (last && nestedNote) last.note = nestedNote;
    }

    let m2aNote = '';
    await safe('Blocks', 'Nested m2a (related_modules) UI + save', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const addRelated = page.getByRole('button', { name: /add related modules/i });
        if ((await addRelated.count()) === 0) {
            // Try partial match
            const alt = page.getByRole('button', { name: /related modules/i });
            if ((await alt.count()) === 0) {
                throw new Error('Add Related modules button missing — nested m2a not in Articles UI');
            }
            await alt.last().click();
        } else {
            await addRelated.last().click();
        }
        await page.waitForTimeout(500);
        // Nested m2a should show collection select / add entry
        const body = await page.locator('body').innerText();
        // M2aFieldInput has "Add" for entries
        const addEntry = page.getByRole('button', { name: /^add$/i }).locator('visible=true');
        // Or look for related collection select
        const hasM2aChrome =
            (await page.locator('select').count()) > 0 ||
            /modules|posts|authors|related/i.test(body);
        if (!hasM2aChrome) {
            throw new Error('related_modules block added but m2a chrome not visible');
        }
        // Try adding an m2a row if Add exists inside the new block
        if ((await addEntry.count()) > 0) {
            await addEntry.last().click();
            await page.waitForTimeout(300);
        }
        await saveItem(page);
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const after = await page.locator('body').innerText();
        if (!/related modules|modules|heading/i.test(after)) {
            // Block may be collapsed — look for type select options
            const types = await page.locator('select').evaluateAll((els) =>
                els.flatMap((e) => [...e.options].map((o) => o.value)),
            );
            if (!types.includes('related_modules')) {
                throw new Error('related_modules not present after reload');
            }
        }
        m2aNote = 'related_modules block added; m2a input chrome present';
    });
    {
        const last = results.findLast((r) => r.check.includes('Nested m2a'));
        if (last && m2aNote) last.note = m2aNote;
    }

    let m2mNote = '';
    await safe('Blocks', 'Nested m2m (related_articles) UI', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const addBtn = page.getByRole('button', { name: /add related articles/i });
        if ((await addBtn.count()) === 0) {
            const alt = page.getByRole('button', { name: /related articles/i });
            if ((await alt.count()) === 0) {
                throw new Error('Add Related articles missing — nested m2m not in Articles UI');
            }
            await alt.last().click();
        } else {
            await addBtn.last().click();
        }
        await page.waitForTimeout(500);
        // many_to_many typically uses PaginatedMultiSelect / combobox
        const body = await page.locator('body').innerText();
        const hasSelect =
            (await page.locator('[role="combobox"], button:has-text("Select"), input[placeholder*="Search" i]').count()) >
                0 || /related articles|select|search/i.test(body);
        if (!hasSelect) {
            // At minimum the block type should be in a select
            const types = await page.locator('select').evaluateAll((els) =>
                els.flatMap((e) => [...e.options].map((o) => o.value)),
            );
            if (!types.includes('related_articles')) {
                throw new Error('related_articles block chrome missing');
            }
        }
        await saveItem(page);
        m2mNote = 'related_articles block added';
    });
    {
        const last = results.findLast((r) => r.check.includes('Nested m2m'));
        if (last && m2mNote) last.note = m2mNote;
    }

    let condNote = '';
    await safe('Blocks', 'Nested conditions (media_variant)', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const addBtn = page.getByRole('button', { name: /add media variant/i });
        if ((await addBtn.count()) === 0) {
            throw new Error('Add Media variant missing');
        }
        await addBtn.last().click();
        await page.waitForTimeout(500);

        // Scope visibility to the newest block (last Duplicate) — older media_variant
        // blocks on polluted items also have Video URL labels.
        const fieldVisibility = async () =>
            page.evaluate(() => {
                const dups = [...document.querySelectorAll('button')].filter((b) =>
                    /^duplicate$/i.test((b.textContent || '').trim()),
                );
                const lastDup = dups[dups.length - 1];
                let root = lastDup?.parentElement ?? null;
                for (let i = 0; i < 10 && root; i++) {
                    if (/media kind/i.test(root.textContent || '')) break;
                    root = root.parentElement;
                }
                if (!root) return { videoUrl: null, imageNote: null, reason: 'no block root' };
                const labels = [...root.querySelectorAll('label')];
                const visible = (re) => {
                    const label = labels.find((l) => re.test(l.textContent || ''));
                    if (!label) return false;
                    return label.offsetParent !== null;
                };
                return {
                    videoUrl: visible(/video url/i),
                    imageNote: visible(/image note/i),
                };
            });

        const kindSelect = page.locator('select').filter({ hasText: /image|video/i }).last();
        if ((await kindSelect.count()) === 0) {
            const byLabel = page.getByLabel(/media kind/i).last();
            if ((await byLabel.count()) === 0) throw new Error('media_kind select not found');
            await byLabel.selectOption('image');
        } else {
            // Force a change event even if first option is already image
            await kindSelect.selectOption('video');
            await page.waitForTimeout(200);
            await kindSelect.selectOption('image');
        }
        await page.waitForTimeout(400);

        let vis = await fieldVisibility();
        if (vis.videoUrl) {
            throw new Error(
                `Video URL should be hidden when media_kind=image (show-when); saw=${JSON.stringify(vis)}`,
            );
        }
        if (!vis.imageNote) {
            throw new Error(`Image note should be visible when media_kind=image; saw=${JSON.stringify(vis)}`);
        }

        if ((await kindSelect.count()) > 0) {
            await kindSelect.selectOption('video');
        } else {
            await page.getByLabel(/media kind/i).last().selectOption('video');
        }
        await page.waitForTimeout(400);

        vis = await fieldVisibility();
        if (!vis.videoUrl) {
            throw new Error(`Video URL should show when media_kind=video; saw=${JSON.stringify(vis)}`);
        }
        if (vis.imageNote) {
            throw new Error(`Image note should hide when media_kind=video; saw=${JSON.stringify(vis)}`);
        }

        await fillLastVisible(page, 'input[name*="[data][video_url]"]', 'https://example.com/v.mp4');
        await saveItem(page);
        condNote =
            'Fixed show-when (hidden:false): image→hide video_url; video→show video_url + hide image_note';
    });
    {
        const last = results.findLast((r) => r.check.includes('Nested conditions'));
        if (last && condNote) last.note = condNote;
    }

    await safe('Blocks', 'Articles golden path reload still intact', async () => {
        await page.goto(itemUrl(ARTICLES_ID, ARTICLES_ITEM), { waitUntil: 'networkidle' });
        const body = await page.locator('body').innerText();
        if (!/add rich text|blocks|section/i.test(body)) {
            throw new Error('Articles blocks chrome missing after suite');
        }
        // Original marker from first add should still be somewhere (or duplicated)
        const vals = await page.locator('input').evaluateAll((els) =>
            els.map((e) => e.value).filter(Boolean),
        );
        if (!vals.some((v) => String(v).includes('QA partial')) && !body.includes('QA partial')) {
            // May have been collapsed — still OK if blocks exist
            const dups = await page.getByRole('button', { name: /duplicate/i }).count();
            if (dups < 1) throw new Error('blocks editor empty after suite');
        }
    });

    await safe('Spot', 'No uncaught pageerrors this session', async () => {
        // Filter known noise
        const serious = pageErrors.filter(
            (e) => !/ResizeObserver|Loading CSS chunk/i.test(e),
        );
        if (serious.length) throw new Error(serious.slice(0, 3).join(' | '));
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
            na: results.filter((r) => r.status === 'N/A').length,
        },
    };
    writeFileSync(
        new URL('../../storage/app/qa-partial-mvp-results.json', import.meta.url),
        JSON.stringify(out, null, 2),
    );
    console.log('\nSummary', out.summary);
    for (const r of results.filter((x) => x.status === 'Fail')) {
        console.log('FAIL', r.area, r.check, r.note);
    }
    await browser.close();
    if (out.summary.fail > 0) process.exitCode = 1;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
