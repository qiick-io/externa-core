/**
 * Unsaved-changes leave-guard audit (Playwright).
 * Run: node tests/Browser/qa-unsaved-changes.mjs
 */
import { chromium } from 'playwright';

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
        record(surface, check, 'FAIL', String(e?.message ?? e).slice(0, 240));
        return false;
    }
}

function dialog(page) {
    return page.getByRole('dialog').filter({
        hasText: /unsaved changes|modifiche non salvate|ungespeicherte/i,
    });
}

async function expectDialog(page) {
    await dialog(page).waitFor({ state: 'visible', timeout: 8000 });
}

async function expectNoDialog(page) {
    await page.waitForTimeout(400);
    if (await dialog(page).isVisible().catch(() => false)) {
        throw new Error('unexpected unsaved dialog');
    }
}

async function keepEditing(page) {
    await page
        .getByRole('button', {
            name: /keep editing|continua a modificare|weiter bearbeiten/i,
        })
        .click();
    await dialog(page).waitFor({ state: 'hidden', timeout: 5000 });
}

async function discard(page) {
    await page
        .getByRole('button', {
            name: /discard changes|scarta modifiche|änderungen verwerfen/i,
        })
        .click();
    await dialog(page).waitFor({ state: 'hidden', timeout: 5000 });
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
    await page.waitForTimeout(250);
}

async function sidebarNav(page, name) {
    const link = page
        .locator('[data-sidebar] a, nav a, aside a')
        .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`, 'i') })
        .first();
    if ((await link.count()) === 0) {
        await page.getByRole('link', { name: new RegExp(`^${name}$`, 'i') }).first().click();
        return;
    }
    await link.click();
}

async function fillDirtyInput(page, selector, value) {
    const input = page.locator(selector).first();
    await input.waitFor({ state: 'visible', timeout: 8000 });
    await input.click();
    await input.fill('');
    await input.fill(value);
    await page.waitForTimeout(150);
}

async function auditDrawerCancel(
    page,
    surface,
    { open, dirty, cancel, assertStillOpen, assertClosed, reopenClean },
) {
    const opened = await safe(surface, 'Open + dirty', async () => {
        await open();
        await dirty();
    });
    if (!opened) return;

    await safe(surface, 'Cancel shows dialog when dirty', async () => {
        await cancel();
        await expectDialog(page);
    });

    await safe(surface, 'Keep stays with edits', async () => {
        await keepEditing(page);
        await assertStillOpen();
    });

    await safe(surface, 'Discard closes and clears', async () => {
        await cancel();
        await expectDialog(page);
        await discard(page);
        await assertClosed();
    });

    if (reopenClean) {
        await safe(surface, 'Clean Cancel — no dialog', async () => {
            await reopenClean();
            await cancel();
            await expectNoDialog(page);
            await assertClosed();
        });
    }
}

async function auditPageNav(
    page,
    surface,
    { open, dirty, leave, assertStayed, assertLeft, reopenClean },
) {
    const opened = await safe(surface, 'Open + dirty', async () => {
        await open();
        await dirty();
    });
    if (!opened) return;

    await safe(surface, 'Nav away shows dialog when dirty', async () => {
        await leave();
        await expectDialog(page);
    });

    await safe(surface, 'Keep stays on page with edits', async () => {
        await keepEditing(page);
        await assertStayed();
    });

    await safe(surface, 'Discard leaves page', async () => {
        await leave();
        await expectDialog(page);
        await discard(page);
        await assertLeft();
    });

    if (reopenClean) {
        await safe(surface, 'Clean nav — no dialog', async () => {
            await reopenClean();
            await leave();
            await expectNoDialog(page);
        });
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await safe('Auth', 'Login', () => login(page));

    let multiCollectionId = null;
    let singletonCollectionId = null;
    let itemEditUrl = null;
    let roleEditUrl = null;

    await goto(page, '/collections');

    const collectionHrefs = await page
        .locator('a[href*="/collections/"]')
        .evaluateAll((as) => [
            ...new Set(as.map((a) => a.getAttribute('href')).filter(Boolean)),
        ]);
    const ids = [];
    for (const href of collectionHrefs) {
        const m = href.match(/\/collections\/(\d+)/);
        if (m && !ids.includes(m[1])) ids.push(m[1]);
    }

    for (const id of ids) {
        if (multiCollectionId && singletonCollectionId) break;
        // Prefer likely singleton slug pages last; still stop early when both found.
        await goto(page, `/collections/${id}`);
        const path = new URL(page.url()).pathname;
        if (path === `/collections/${id}` || path === `/collections/${id}/`) {
            if (!singletonCollectionId) singletonCollectionId = id;
        } else if (path.includes('/items')) {
            if (!multiCollectionId) multiCollectionId = id;
        }
    }
    if (!multiCollectionId && ids[0]) multiCollectionId = ids[0];

    if (multiCollectionId) {
        await goto(page, `/collections/${multiCollectionId}/items`);
        const itemLink = page
            .locator(`a[href*="/collections/${multiCollectionId}/items/"]`)
            .filter({ hasNotText: /new/i })
            .first();
        if (await itemLink.count()) {
            const href = await itemLink.getAttribute('href');
            if (href) {
                itemEditUrl = href.startsWith('http') ? href : `${BASE}${href}`;
            }
        }
        if (!itemEditUrl) {
            itemEditUrl = `${BASE}/collections/${multiCollectionId}/items/new`;
        }
    }

    await goto(page, '/settings/roles');
    const roleLink = page
        .locator('a[href*="/settings/roles/"][href*="/edit"]')
        .first();
    if (await roleLink.count()) {
        const href = await roleLink.getAttribute('href');
        if (href) {
            roleEditUrl = href.startsWith('http') ? href : `${BASE}${href}`;
        }
    }

    console.log('\nDiscovered:', {
        multiCollectionId,
        singletonCollectionId,
        itemEditUrl,
        roleEditUrl,
    });

    // 1. Collections
    {
        const surface = '1. Collections create drawer';
        await goto(page, '/collections');
        await auditDrawerCancel(page, surface, {
            open: async () => {
                await page
                    .getByRole('button', {
                        name: /new collection|create collection/i,
                    })
                    .first()
                    .click();
                await page
                    .locator('#collection_drawer_name')
                    .waitFor({ state: 'visible' });
            },
            dirty: async () => {
                await fillDirtyInput(
                    page,
                    '#collection_drawer_name',
                    'Unsaved Audit Collection',
                );
            },
            cancel: async () => {
                await page.getByRole('button', { name: /^cancel$/i }).click();
            },
            assertStillOpen: async () => {
                const v = await page
                    .locator('#collection_drawer_name')
                    .inputValue();
                if (!v.includes('Unsaved Audit')) {
                    throw new Error(`edits lost: ${v}`);
                }
            },
            assertClosed: async () => {
                await page
                    .locator('#collection_drawer_name')
                    .waitFor({ state: 'hidden', timeout: 5000 });
            },
            reopenClean: async () => {
                await page
                    .getByRole('button', {
                        name: /new collection|create collection/i,
                    })
                    .first()
                    .click();
                await page
                    .locator('#collection_drawer_name')
                    .waitFor({ state: 'visible' });
            },
        });

        await safe(surface, 'Edit drawer dirty Cancel dialog', async () => {
            await goto(page, '/collections');
            await page.getByRole('button', { name: /^edit$/i }).first().click();
            await page
                .locator('#collection_drawer_name')
                .waitFor({ state: 'visible' });
            const original = await page
                .locator('#collection_drawer_name')
                .inputValue();
            await fillDirtyInput(
                page,
                '#collection_drawer_name',
                `${original} X`,
            );
            await page.getByRole('button', { name: /^cancel$/i }).click();
            await expectDialog(page);
            await keepEditing(page);
            await page.getByRole('button', { name: /^cancel$/i }).click();
            await expectDialog(page);
            await discard(page);
            await page
                .locator('#collection_drawer_name')
                .waitFor({ state: 'hidden', timeout: 5000 });
        });
    }

    // 2. Fields
    {
        const surface = '2. Collection fields';
        if (!multiCollectionId) {
            record(surface, 'all', 'SKIP', 'no multi-item collection');
        } else {
            await goto(page, `/collections/${multiCollectionId}/fields`);

            await auditDrawerCancel(page, `${surface} create`, {
                open: async () => {
                    await page
                        .getByRole('button', { name: /create field/i })
                        .first()
                        .click();
                    await page
                        .getByRole('dialog')
                        .filter({ hasText: /create field|choose a field type/i })
                        .waitFor({ state: 'visible' });
                    await page
                        .getByRole('dialog')
                        .getByRole('button', { name: /^text input$/i })
                        .click();
                    await page
                        .locator('input[name="name"]')
                        .waitFor({ state: 'visible', timeout: 8000 });
                },
                dirty: async () => {
                    await fillDirtyInput(
                        page,
                        'input[name="name"]',
                        'unsaved_audit_field',
                    );
                },
                cancel: async () => {
                    await page
                        .getByRole('dialog')
                        .getByRole('button', { name: /^cancel$/i })
                        .click();
                },
                assertStillOpen: async () => {
                    const v = await page
                        .locator('input[name="name"]')
                        .inputValue();
                    if (!v.includes('unsaved_audit')) {
                        throw new Error(`edits lost: ${v}`);
                    }
                },
                assertClosed: async () => {
                    await page.waitForTimeout(400);
                    const still = await page
                        .locator('input[name="name"]')
                        .isVisible()
                        .catch(() => false);
                    if (still) throw new Error('field form still open');
                },
                reopenClean: null,
            });

            await safe(`${surface} edit`, 'Edit field Cancel dialog', async () => {
                await goto(page, `/collections/${multiCollectionId}/fields`);
                // Field cards look like "nome_agente\nText Input · Required"
                const fieldBtn = page
                    .getByRole('button')
                    .filter({ hasText: /Text Input ·/i })
                    .first();
                await fieldBtn.click();
                await page
                    .getByRole('dialog')
                    .filter({ hasText: /update settings/i })
                    .waitFor({ state: 'visible', timeout: 8000 });
                await fillDirtyInput(page, 'input[name="name"]', 'nome_agente_unsaved');
                await page
                    .getByRole('dialog')
                    .getByRole('button', { name: /^cancel$/i })
                    .click();
                await expectDialog(page);
                await keepEditing(page);
                await page
                    .getByRole('dialog')
                    .getByRole('button', { name: /^cancel$/i })
                    .click();
                await expectDialog(page);
                await discard(page);
            });

            await safe(`${surface} escape/overlay`, 'Escape + overlay prompt when dirty', async () => {
                await goto(page, `/collections/${multiCollectionId}/fields`);
                await page.getByRole('button', { name: /create field/i }).first().click();
                await page
                    .getByRole('dialog')
                    .locator('button', { hasText: 'Text Input' })
                    .first()
                    .click();
                await fillDirtyInput(page, 'input[name="name"]', 'escape_overlay_field');
                await page.keyboard.press('Escape');
                await expectDialog(page);
                await keepEditing(page);
                const overlay = page.locator('[data-slot=drawer-overlay]').last();
                await overlay.click({ position: { x: 8, y: 8 }, force: true });
                await expectDialog(page);
                await discard(page);
            });
        }
    }

    // 3. Item form
    {
        const surface = '3. Collection item form';
        if (!itemEditUrl) {
            record(surface, 'all', 'SKIP', 'no item URL');
        } else {
            await auditPageNav(page, surface, {
                open: async () => goto(page, itemEditUrl),
                dirty: async () => {
                    const input = page
                        .locator(
                            'form input[type="text"], form textarea, form input:not([type=hidden]):not([type=checkbox]):not([type=radio])',
                        )
                        .first();
                    await input.waitFor({ state: 'visible' });
                    const v = await input.inputValue().catch(() => '');
                    await input.fill(`${v} unsaved`);
                    await page.waitForTimeout(150);
                },
                leave: async () => sidebarNav(page, 'Collections'),
                assertStayed: async () => {
                    if (!page.url().includes('/items/')) {
                        throw new Error(`left unexpectedly: ${page.url()}`);
                    }
                },
                assertLeft: async () => {
                    await page.waitForURL(
                        (u) => !u.pathname.includes('/items/'),
                        { timeout: 8000 },
                    );
                },
                reopenClean: async () => goto(page, itemEditUrl),
            });
        }
    }

    // 4. Singleton
    {
        const surface = '4. Singleton show';
        if (!singletonCollectionId) {
            record(surface, 'all', 'SKIP', 'no singleton collection found');
        } else {
            await auditPageNav(page, surface, {
                open: async () =>
                    goto(page, `/collections/${singletonCollectionId}`),
                dirty: async () => {
                    const input = page
                        .locator(
                            'form input[type="text"], form textarea, form input:not([type=hidden]):not([type=checkbox]):not([type=radio])',
                        )
                        .first();
                    if ((await input.count()) === 0) {
                        throw new Error('no editable fields');
                    }
                    const v = await input.inputValue().catch(() => '');
                    await input.fill(`${v} unsaved`);
                    await page.waitForTimeout(150);
                },
                leave: async () => sidebarNav(page, 'Collections'),
                assertStayed: async () => {
                    if (
                        !page.url().includes(
                            `/collections/${singletonCollectionId}`,
                        )
                    ) {
                        throw new Error(`left unexpectedly: ${page.url()}`);
                    }
                },
                assertLeft: async () => {
                    await page.waitForURL(
                        (u) =>
                            u.pathname === '/collections' ||
                            u.pathname.endsWith('/collections'),
                        { timeout: 8000 },
                    );
                },
                reopenClean: null,
            });
        }
    }

    // 5. Roles
    {
        const surface = '5. Roles edit';
        if (!roleEditUrl) {
            record(surface, 'all', 'SKIP', 'no role edit URL');
        } else {
            await auditPageNav(page, surface, {
                open: async () => {
                    await goto(page, roleEditUrl);
                    await page.waitForTimeout(500);
                },
                dirty: async () => {
                    await fillDirtyInput(
                        page,
                        'input[name="name"], #name, input#role_name',
                        'Unsaved Role Name',
                    );
                },
                leave: async () => sidebarNav(page, 'Users'),
                assertStayed: async () => {
                    if (!page.url().includes('/roles/')) {
                        throw new Error(`left: ${page.url()}`);
                    }
                    const v = await page
                        .locator('input[name="name"], #name, input#role_name')
                        .first()
                        .inputValue();
                    if (!v.includes('Unsaved Role')) {
                        throw new Error(`edits lost: ${v}`);
                    }
                },
                assertLeft: async () => {
                    await page.waitForURL(
                        (u) => !u.pathname.includes('/roles/'),
                        { timeout: 8000 },
                    );
                },
                reopenClean: async () => {
                    await goto(page, roleEditUrl);
                    await page.waitForTimeout(500);
                },
            });
        }
    }

    // 6. Users
    {
        const surface = '6. Users drawer';
        await goto(page, '/users');
        if (page.url().includes('/login')) {
            record(surface, 'all', 'SKIP', 'no access');
        } else {
            await auditDrawerCancel(page, surface, {
                open: async () => {
                    await page
                        .getByRole('button', { name: /new user/i })
                        .first()
                        .click();
                    await page
                        .locator('#user_first_name')
                        .waitFor({ state: 'visible' });
                },
                dirty: async () => {
                    await fillDirtyInput(
                        page,
                        '#user_first_name',
                        'UnsavedUser',
                    );
                },
                cancel: async () => {
                    await page.getByRole('button', { name: /^cancel$/i }).click();
                },
                assertStillOpen: async () => {
                    const v = await page
                        .locator('#user_first_name')
                        .inputValue();
                    if (v !== 'UnsavedUser') throw new Error(`edits lost: ${v}`);
                },
                assertClosed: async () => {
                    await page
                        .locator('#user_first_name')
                        .waitFor({ state: 'hidden', timeout: 5000 });
                },
                reopenClean: async () => {
                    await page
                        .getByRole('button', { name: /new user/i })
                        .first()
                        .click();
                    await page
                        .locator('#user_first_name')
                        .waitFor({ state: 'visible' });
                },
            });
        }
    }

    // 7. Groups
    {
        const surface = '7. Groups drawer';
        await goto(page, '/groups');
        if (!/groups/.test(page.url())) {
            record(surface, 'all', 'SKIP', `could not open groups: ${page.url()}`);
        } else {
            await auditDrawerCancel(page, surface, {
                open: async () => {
                    await page
                        .getByRole('button', { name: /new group/i })
                        .first()
                        .click();
                    await page
                        .locator('#group_name')
                        .waitFor({ state: 'visible' });
                },
                dirty: async () => {
                    await fillDirtyInput(page, '#group_name', 'UnsavedGroup');
                },
                cancel: async () => {
                    await page.getByRole('button', { name: /^cancel$/i }).click();
                },
                assertStillOpen: async () => {
                    const v = await page.locator('#group_name').inputValue();
                    if (v !== 'UnsavedGroup') {
                        throw new Error(`edits lost: ${v}`);
                    }
                },
                assertClosed: async () => {
                    await page
                        .locator('#group_name')
                        .waitFor({ state: 'hidden', timeout: 5000 });
                },
                reopenClean: async () => {
                    await page
                        .getByRole('button', { name: /new group/i })
                        .first()
                        .click();
                    await page
                        .locator('#group_name')
                        .waitFor({ state: 'visible' });
                },
            });
        }
    }

    // 8. Project
    {
        const surface = '8. Project settings';
        await auditPageNav(page, surface, {
            open: async () => goto(page, '/settings/project'),
            dirty: async () => {
                const input = page
                    .locator(
                        'form input[type="text"], form input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color])',
                    )
                    .first();
                await input.waitFor({ state: 'visible' });
                const v = await input.inputValue().catch(() => '');
                await input.fill(`${v}X`);
                await page.waitForTimeout(150);
            },
            leave: async () => sidebarNav(page, 'Collections'),
            assertStayed: async () => {
                if (!page.url().includes('/settings/project')) {
                    throw new Error(`left: ${page.url()}`);
                }
            },
            assertLeft: async () => {
                await page.waitForURL(
                    (u) => !u.pathname.includes('/settings/project'),
                    { timeout: 8000 },
                );
            },
            reopenClean: async () => goto(page, '/settings/project'),
        });
    }

    // 9. Appearance
    {
        const surface = '9. Appearance';
        await auditPageNav(page, surface, {
            open: async () => goto(page, '/settings/appearance'),
            dirty: async () => {
                const color = page.locator('input[name="project_color"]').first();
                await color.waitFor({ state: 'visible' });
                const v = await color.inputValue();
                await color.fill(v === '#112233' ? '#332211' : '#112233');
                await page.waitForTimeout(150);
            },
            leave: async () => sidebarNav(page, 'Collections'),
            assertStayed: async () => {
                if (!page.url().includes('/settings/appearance')) {
                    throw new Error(`left: ${page.url()}`);
                }
            },
            assertLeft: async () => {
                await page.waitForURL(
                    (u) => !u.pathname.includes('/settings/appearance'),
                    { timeout: 8000 },
                );
            },
            reopenClean: null,
        });
    }

    // 10. Clean nav
    {
        const surface = '10. Clean navigation';
        await safe(surface, 'No dialog when clean', async () => {
            await goto(page, '/collections');
            await sidebarNav(page, 'Users');
            await page.waitForTimeout(400);
            await expectNoDialog(page);
            await sidebarNav(page, 'Collections');
            await page.waitForTimeout(400);
            await expectNoDialog(page);
        });
    }

    // 11. beforeunload
    {
        const surface = '11. beforeunload';
        await safe(surface, 'Dirty page registers beforeunload', async () => {
            await goto(page, '/settings/project');
            const input = page
                .locator(
                    'form input[type="text"], form input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color])',
                )
                .first();
            await input.fill('beforeunload-dirty');
            await page.waitForTimeout(200);
            const triggered = await page.evaluate(() => {
                const event = new Event('beforeunload', { cancelable: true });
                Object.defineProperty(event, 'returnValue', {
                    writable: true,
                    value: undefined,
                });
                window.dispatchEvent(event);
                return event.defaultPrevented || event.returnValue === '';
            });
            if (!triggered) {
                throw new Error('beforeunload did not preventDefault');
            }
        });
    }

    const providerErr = consoleErrors.filter((e) =>
        /useUnsavedChanges must be used within UnsavedChangesProvider/i.test(e),
    );
    await safe('Console', 'No provider missing errors', async () => {
        if (providerErr.length) throw new Error(providerErr.join(' | '));
    });

    await browser.close();

    console.log('\n═══ MATRIX ═══');
    const bySurface = new Map();
    for (const r of results) {
        if (!bySurface.has(r.surface)) bySurface.set(r.surface, []);
        bySurface.get(r.surface).push(r);
    }
    for (const [surface, checks] of bySurface) {
        const failed = checks.filter((c) => c.status === 'FAIL');
        const skipped = checks.every((c) => c.status === 'SKIP');
        const status = skipped ? 'SKIP' : failed.length ? 'FAIL' : 'PASS';
        console.log(
            `${status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○'} ${surface}: ${status}${failed.length ? ` (${failed.map((f) => f.check).join('; ')})` : ''}`,
        );
        for (const f of failed) {
            console.log(`    · ${f.check}: ${f.note}`);
        }
    }

    const fails = results.filter((r) => r.status === 'FAIL');
    console.log(
        `\n${results.filter((r) => r.status === 'PASS').length} pass, ${fails.length} fail, ${results.filter((r) => r.status === 'SKIP').length} skip`,
    );
    process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
