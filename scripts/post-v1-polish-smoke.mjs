import { chromium } from 'playwright';

/**
 * Post-v1 polish smoke against Herd APP_URL.
 * Prefer Vite running (`npm run dev`) or a production build so Inertia hydrates.
 * Always runs GraphQL HTTP probe; UI checks soft-fail with a clear message when Vite is down.
 */
const base = process.env.APP_URL || 'http://externa-core.test';
const email = process.env.SMOKE_EMAIL || 'superadmin@example.com';
const password = process.env.SMOKE_PASSWORD || 'password';

async function main() {
    const failures = [];
    const warnings = [];

    // HTTP probes (no browser)
    try {
        const loginRes = await fetch(`${base}/login`);
        if (!loginRes.ok) {
            failures.push(`GET /login → ${loginRes.status}`);
        }

        const gql = await fetch(`${base}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ __typename }' }),
        });
        if (gql.status >= 500) {
            failures.push(`GraphQL → ${gql.status}`);
        }
    } catch (error) {
        failures.push(`HTTP probe: ${error}`);
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const emailInput = page.locator('input[type="email"], input[name="email"]').first();
        try {
            await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            warnings.push(
                'Login form did not hydrate (start `npm run dev` or use built assets). Skipping UI checks.',
            );
            return;
        }

        await emailInput.fill(email);
        await page.locator('input[type="password"], input[name="password"]').first().fill(password);
        await Promise.all([
            page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }),
            page.locator('button[type="submit"]').first().click(),
        ]);

        await page.goto(`${base}/collections`, { waitUntil: 'networkidle' });
        if (!page.url().includes('/collections')) {
            failures.push(`Expected /collections, got ${page.url()}`);
        }

        const itemsLink = page.locator('a[href*="/items"]').first();
        if (await itemsLink.count()) {
            await itemsLink.click();
            await page.waitForLoadState('networkidle');

            const exportBtn = page.getByRole('button', { name: /Export/i });
            if ((await exportBtn.count()) === 0) {
                failures.push('Export button missing on items index');
            } else {
                await exportBtn.click();
                const csv = page.getByText(/Export CSV/i);
                if ((await csv.count()) === 0) {
                    failures.push('Export CSV menu item missing');
                }
            }
        } else {
            warnings.push('No collection items link found (seed data?)');
        }

        await page.goto(`${base}/settings/jobs`, { waitUntil: 'networkidle' });
        if (page.url().includes('/login')) {
            failures.push('Jobs page redirected to login');
        }
    } catch (error) {
        failures.push(String(error));
    } finally {
        await browser.close();
        for (const w of warnings) {
            console.warn('warn:', w);
        }
        if (failures.length) {
            console.error('post-v1 polish smoke FAILED:');
            for (const f of failures) {
                console.error(' -', f);
            }
            process.exit(1);
        }
        console.log('post-v1 polish smoke OK');
    }
}

main();
