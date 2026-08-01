/**
 * Performance settings comprehensive test
 * Tests: status display, bootstrap cache, public API cache, observability links, flush actions
 * Run: node tests/Browser/performance-settings-test.mjs
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

    // 1. Page loads with all sections
    await safe('Performance', 'Performance settings page loads', async () => {
        await page.goto(`${BASE}/settings/performance`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    // 2. Runtime status section
    await safe('Performance', 'Runtime status values visible', async () => {
        const cacheStore = page.locator('[data-test="performance-cache-store"]');
        const redisReachable = page.locator('[data-test="performance-redis-reachable"]');
        const queueConnection = page.locator('[data-test="performance-queue-connection"]');
        const appEnv = page.locator('[data-test="performance-app-env"]');
        const appDebug = page.locator('[data-test="performance-app-debug"]');

        await cacheStore.waitFor({ state: 'visible', timeout: 3000 });
        await redisReachable.waitFor({ state: 'visible', timeout: 3000 });
        await queueConnection.waitFor({ state: 'visible', timeout: 3000 });
        await appEnv.waitFor({ state: 'visible', timeout: 3000 });
        await appDebug.waitFor({ state: 'visible', timeout: 3000 });

        const cacheText = await cacheStore.textContent();
        const queueText = await queueConnection.textContent();
        if (!cacheText || !queueText) {
            throw new Error('Runtime status values empty');
        }
    });

    // 3. Bootstrap cache section
    await safe('Performance', 'Bootstrap cache status visible', async () => {
        const configCached = page.locator('[data-test="performance-config-cached"]');
        const routesCached = page.locator('[data-test="performance-routes-cached"]');
        const eventsCached = page.locator('[data-test="performance-events-cached"]');
        const packagesCached = page.locator('[data-test="performance-packages-cached"]');

        await configCached.waitFor({ state: 'visible', timeout: 3000 });
        await routesCached.waitFor({ state: 'visible', timeout: 3000 });
        await eventsCached.waitFor({ state: 'visible', timeout: 3000 });
        await packagesCached.waitFor({ state: 'visible', timeout: 3000 });

        const configText = await configCached.textContent();
        if (!configText || !['Yes', 'No', 'Sì'].includes(configText.trim())) {
            throw new Error('Bootstrap cache values invalid');
        }
    });

    // 4. Public API cache section
    await safe('Performance', 'Public API cache values visible', async () => {
        const ttl = page.locator('[data-test="performance-public-api-ttl"]');
        const epoch = page.locator('[data-test="performance-public-api-epoch"]');

        await ttl.waitFor({ state: 'visible', timeout: 3000 });
        await epoch.waitFor({ state: 'visible', timeout: 3000 });

        const ttlText = await ttl.textContent();
        const epochText = await epoch.textContent();
        if (!ttlText || !epochText || isNaN(Number(epochText))) {
            throw new Error('Public API cache values invalid');
        }
    });

    // 5. Observability links (super-admin should see all)
    await safe('Performance', 'Observability links visible for super-admin', async () => {
        const jobsLink = page.locator('[data-test="performance-link-jobs"]');
        const pulseLink = page.locator('[data-test="performance-link-pulse"]');
        const horizonLink = page.locator('[data-test="performance-link-horizon"]');

        await jobsLink.waitFor({ state: 'visible', timeout: 3000 });
        await pulseLink.waitFor({ state: 'visible', timeout: 3000 });
        await horizonLink.waitFor({ state: 'visible', timeout: 3000 });
    });

    // 6. Flush actions work
    await safe('Performance', 'Public API flush increments epoch', async () => {
        const epochBefore = page.locator('[data-test="performance-public-api-epoch"]');
        const epochValueBefore = Number(await epochBefore.textContent());

        const flushBtn = page.locator('[data-test="performance-flush-publicApi"]');
        await flushBtn.waitFor({ state: 'visible', timeout: 3000 });
        await flushBtn.click();

        // Wait for redirect and page reload
        await page.waitForTimeout(2000);
        await page.waitForSelector('[data-test="performance-public-api-epoch"]', { timeout: 5000 });

        const epochAfter = page.locator('[data-test="performance-public-api-epoch"]');
        const epochValueAfter = Number(await epochAfter.textContent());

        if (epochValueAfter !== epochValueBefore + 1) {
            throw new Error(`Epoch did not increment: ${epochValueBefore} → ${epochValueAfter}`);
        }
    });

    // 7. Test another flush button
    await safe('Performance', 'Dashboard metrics flush button works', async () => {
        const flushBtn = page.locator('[data-test="performance-flush-dashboardMetrics"]');
        await flushBtn.waitFor({ state: 'visible', timeout: 3000 });
        await flushBtn.click();

        // FlashToasts → Sonner; avoid /cache/i (matches many labels on the page)
        const toast = page.locator('[data-sonner-toast]').filter({
            hasText: /Dashboard metrics cache flushed/i,
        });
        await toast.first().waitFor({ state: 'visible', timeout: 8000 });
    });

    // 8. Users without permission get 403
    await safe('Auth', '403 without CanManageProjectSettings', async () => {
        await page.context().clearCookies();
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
        await page.locator('input[type="email"]').first().fill('reader@test.com');
        await page.locator('input[type="password"]').first().fill(PASS);
        await page.locator('button[type="submit"]').filter({ hasText: /log in|sign in/i }).first().click();
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

        const resp = await page.goto(`${BASE}/settings/performance`, { waitUntil: 'networkidle' });
        if (resp?.status() !== 403) {
            const forbidden = await page.getByText(/403|forbidden/i).count();
            if (forbidden === 0) {
                throw new Error(`Expected 403, got status=${resp?.status()} url=${page.url()}`);
            }
        }
    });

    await browser.close();

    console.log('\n=== Results Summary ===');
    const passed = results.filter(r => r.status === 'Pass').length;
    const failed = results.filter(r => r.status === 'Fail').length;
    console.log(`Passed: ${passed}/${results.length}`);
    console.log(`Failed: ${failed}/${results.length}`);

    if (failed > 0) {
        console.log('\n=== Failed Tests ===');
        results.filter(r => r.status === 'Fail').forEach(r => {
            console.log(`✗ [${r.area}] ${r.check}`);
            if (r.note) console.log(`  ${r.note}`);
        });
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
});
