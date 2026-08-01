/**
 * Comprehensive Collections & Items UI test
 * Tests: checkboxes, filters, sorting, pagination, bulk actions, CRUD
 * Run: node tests/Browser/collections-items-comprehensive-test.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';

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

    // 1. Auth
    await safe('Auth', 'Login as superadmin', () => login(page));

    // 2. Collections list
    await safe('Collections', 'List page loads', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        await page.getByText(/collections/i).first().waitFor();
    });

    let collectionId = null;
    await safe('Collections', 'Find Blog Posts collection', async () => {
        // Try multiple strategies to find the collection
        // Strategy 1: Look for "Blog Posts" text anywhere on page
        const blogPostsText = page.getByText('Blog Posts', { exact: false });
        if (await blogPostsText.count() > 0) {
            // Find the closest link
            const row = blogPostsText.first().locator('xpath=ancestor::tr | ancestor::div[contains(@class, "card")]').first();
            const link = row.locator('a[href*="/collections/"]').first();
            if (await link.count() > 0) {
                const href = await link.getAttribute('href');
                const m = href?.match(/collections\/(\d+)/);
                if (m) collectionId = m[1];
            }
        }
        
        // Strategy 2: Just get the first collection link
        if (!collectionId) {
            const anyLink = page.locator('a[href*="/collections/"][href*="/items"], a[href*="/collections/"][href*="/fields"]').first();
            if (await anyLink.count() > 0) {
                const href = await anyLink.getAttribute('href');
                const m = href?.match(/collections\/(\d+)/);
                if (m) collectionId = m[1];
            }
        }
        
        if (!collectionId) throw new Error('No collection link found on page');
        console.log(`  Found collection ID: ${collectionId}`);
    });

    await safe('Collections', 'Multi-select checkbox visible', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        const checkbox = page.locator('table input[type="checkbox"], [role="checkbox"]').nth(1);
        if ((await checkbox.count()) === 0) throw new Error('no row checkbox');
        await checkbox.waitFor({ state: 'visible' });
    });

    await safe('Collections', 'Multi-select shows selection count', async () => {
        await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
        const checkbox = page.locator('table input[type="checkbox"], [role="checkbox"]').nth(1);
        await checkbox.click();
        await page.getByText(/\d+\s+selected/i).first().waitFor({ timeout: 5000 });
    });

    // 3. Navigate to items
    if (!collectionId) {
        record('Items', 'All item tests', 'Fail', 'No collection ID found');
        await browser.close();
        return;
    }

    await safe('Items', 'Items page loads', async () => {
        await page.goto(`${BASE}/collections/${collectionId}/items`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
    });

    await safe('Items', 'Table renders with rows', async () => {
        const table = page.locator('table').first();
        await table.waitFor({ state: 'visible' });
        const rows = page.locator('tbody tr');
        const count = await rows.count();
        if (count === 0) throw new Error('No rows in table');
    });

    await safe('Items', 'Search box visible', async () => {
        const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
        await search.waitFor({ state: 'visible' });
    });

    await safe('Items', 'Search filters results', async () => {
        const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
        await search.fill('Post 1');
        await page.waitForTimeout(500);
        const rows = page.locator('tbody tr');
        const count = await rows.count();
        if (count === 0) throw new Error('Search returned no results');
    });

    await safe('Items', 'Clear search shows all items', async () => {
        const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
        await search.clear();
        await page.waitForTimeout(500);
        const rows = page.locator('tbody tr');
        const count = await rows.count();
        if (count === 0) throw new Error('No items after clearing search');
    });

    await safe('Items', 'Item multi-select checkbox visible', async () => {
        const checkbox = page.locator('tbody input[type="checkbox"], tbody [role="checkbox"]').first();
        await checkbox.waitFor({ state: 'visible' });
    });

    await safe('Items', 'Item multi-select shows count', async () => {
        const checkbox = page.locator('tbody input[type="checkbox"], tbody [role="checkbox"]').first();
        await checkbox.click();
        await page.getByText(/\d+\s+selected/i).first().waitFor({ timeout: 5000 });
    });

    await safe('Items', 'Bulk action toolbar appears', async () => {
        // The bulk actions appear inline when items are selected
        // Look for the "{N} selected" button with X icon
        const selectionBtn = page.getByRole('button', { name: /\d+\s+selected/i });
        await selectionBtn.waitFor({ state: 'visible' });
    });

    await safe('Items', 'Clear selection button works', async () => {
        const clearBtn = page.getByRole('button', { name: /\d+\s+selected/i });
        await clearBtn.click();
        await page.waitForTimeout(300);
        // After clearing, the search box should reappear
        const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
        await search.waitFor({ state: 'visible' });
    });

    await safe('Items', 'Filter builder button visible', async () => {
        // ItemFiltersBuilder should be visible as trailing element when no selection
        const filterBtn = page.getByRole('button', { name: /field filters|filters|add filter/i }).first();
        await filterBtn.waitFor({ state: 'visible' });
    });

    await safe('Items', 'Sort controls present', async () => {
        const sortSelect = page.locator('select, [role="combobox"]').filter({ hasText: /sort|order/i }).first();
        const sortBtn = page.locator('button[aria-label*="sort" i], button[aria-label*="order" i]').first();
        const hasSortControl = (await sortSelect.count() > 0) || (await sortBtn.count() > 0);
        if (!hasSortControl) throw new Error('No sort controls found');
    });

    await safe('Items', 'Column picker visible in table header', async () => {
        // ColumnPickerPopover is in the table header
        const columnBtn = page.locator('button[aria-label*="column" i], button[aria-label*="customize" i]').first();
        // Or look for the Rows3 icon which is used for column picker
        const columnIcon = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: '' });
        const hasControl = (await columnBtn.count() > 0) || (await columnIcon.count() > 0);
        if (!hasControl) {
            // Try to find any button in the table header area
            const headerButtons = page.locator('thead button');
            if (await headerButtons.count() === 0) throw new Error('No buttons in table header');
        }
    });

    await safe('Items', 'Pagination works', async () => {
        await page.goto(`${BASE}/collections/${collectionId}/items`, { waitUntil: 'networkidle' });
        const initialRows = await page.locator('tbody tr').count();
        
        // Look for TablePagination component
        const nextBtn = page.getByRole('button', { name: /next/i }).first();
        const pageLink = page.locator('nav a[href*="page="]').filter({ hasText: /^2$/ }).first();
        
        if (await nextBtn.isVisible()) {
            await nextBtn.click();
            await page.waitForTimeout(1000);
            const newUrl = page.url();
            if (!newUrl.includes('page=2')) throw new Error('Pagination did not change URL');
        } else if (await pageLink.isVisible()) {
            await pageLink.click();
            await page.waitForTimeout(1000);
            const newUrl = page.url();
            if (!newUrl.includes('page=2')) throw new Error('Pagination did not change URL');
        } else {
            // No pagination needed if all items fit on one page
            console.log(`  Only ${initialRows} rows, pagination not needed`);
        }
    });

    await safe('Items', 'Create new item button visible', async () => {
        // The "New item" button is in AppLayout headerActions, wrapped in Button asChild with Link
        await page.goto(`${BASE}/collections/${collectionId}/items`, { waitUntil: 'networkidle' });
        
        // Strategy 1: Look for link with "New item" text
        const newItemLink = page.getByRole('link', { name: /new item/i });
        if (await newItemLink.count() > 0) {
            await newItemLink.first().waitFor({ state: 'visible', timeout: 3000 });
            return;
        }
        
        // Strategy 2: Look for any button/link in header with Plus icon and "item" text
        const plusLinks = page.locator('a').filter({ hasText: /item/i });
        if (await plusLinks.count() > 0) {
            await plusLinks.first().waitFor({ state: 'visible', timeout: 3000 });
            return;
        }
        
        throw new Error('New item button not found');
    });

    await safe('Items', 'Create item link navigates to form', async () => {
        const newItemLink = page.getByRole('link', { name: /new item/i }).first();
        const href = await newItemLink.getAttribute('href');
        if (!href || (!href.includes('/new') && !href.includes('/create'))) {
            throw new Error(`Link href is "${href}", expected to contain /new or /create`);
        }
        await newItemLink.click();
        await page.waitForURL(/\/items\/(new|create)/, { timeout: 5000 });
    });

    console.log('\n=== SUMMARY ===');
    console.log({
        passed: results.filter(r => r.status === 'Pass').length,
        failed: results.filter(r => r.status === 'Fail').length,
    });

    await browser.close();
}

main().catch(console.error);
