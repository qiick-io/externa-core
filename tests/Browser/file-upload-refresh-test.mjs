/**
 * Test file upload refresh bug - after upload, new file should appear without full page refresh.
 * Run: node tests/Browser/file-upload-refresh-test.mjs
 *
 * KNOWN BUG TO REPRODUCE: After uploading a file, the new file does not appear in the grid
 * until a full page refresh (F5) is performed. The `router.reload({ only: ['files'] })` after
 * upload completion should automatically refresh the file list, but it doesn't.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';

async function login(page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASS);
    // Click the password login button (not the passkey button)
    await page.locator('button[type="submit"]').filter({ hasText: /log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function main() {
    const browser = await chromium.launch({ headless: false }); // headless: false to watch
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(12000);

    console.log('1. Login...');
    await login(page);

    console.log('2. Navigate to files page...');
    await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
    await page.waitForSelector('body');

    console.log('3. Count initial files...');
    const initialFileCount = await page.locator('[data-testid^="file-card-"]').count();
    console.log(`   Initial file count: ${initialFileCount}`);

    console.log('4. Create a test file...');
    const testFileName = `upload-test-${Date.now()}.txt`;
    const testFilePath = join(tmpdir(), testFileName);
    writeFileSync(testFilePath, 'Test content from upload refresh test');
    console.log(`   Created: ${testFilePath}`);

    console.log('5. Upload the file...');
    // Click the Upload button to reveal the dropdown
    const uploadButton = page.getByRole('button', { name: /^upload$/i });
    await uploadButton.waitFor({ state: 'visible' });
    await uploadButton.click();

    // Click "Upload file" from the dropdown menu
    const uploadFileItem = page.getByText(/upload file/i).first();
    await uploadFileItem.waitFor({ state: 'visible' });

    // Set up file chooser handler before clicking
    const fileChooserPromise = page.waitForEvent('filechooser');
    await uploadFileItem.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testFilePath);

    console.log('6. Wait for upload to complete...');
    // Wait for the upload indicator to appear and then disappear
    try {
        await page.waitForSelector('[data-testid="file-upload-indicator"]', {
            state: 'visible',
            timeout: 5000,
        });
        console.log('   Upload indicator appeared');
    } catch {
        console.log('   Upload indicator did not appear (might be too fast)');
    }

    // Wait for upload to complete (indicator disappears or shows "complete" status)
    await page.waitForTimeout(2000); // Give it time to upload and refresh

    console.log('7. Check if file appears WITHOUT full page refresh...');
    const afterUploadCount = await page.locator('[data-testid^="file-card-"]').count();
    const fileCard = page.locator(`[data-testid^="file-card-"]`, {
        has: page.locator(`:text("${testFileName}")`),
    });
    const fileExists = (await fileCard.count()) > 0;

    console.log(`   File count after upload: ${afterUploadCount}`);
    console.log(`   Expected count: ${initialFileCount + 1}`);
    console.log(`   File card found: ${fileExists}`);

    if (fileExists && afterUploadCount === initialFileCount + 1) {
        console.log('✓ BUG FIXED: File appears automatically after upload!');
    } else {
        console.log('✗ BUG REPRODUCED: File does NOT appear after upload (requires F5)');
        console.log('   Attempting full page refresh to verify file was actually uploaded...');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        const afterRefreshCount = await page.locator('[data-testid^="file-card-"]').count();
        const afterRefreshExists = (await page.locator(`[data-testid^="file-card-"]`, {
            has: page.locator(`:text("${testFileName}")`),
        }).count()) > 0;
        console.log(`   After F5: count=${afterRefreshCount}, file exists=${afterRefreshExists}`);

        if (afterRefreshExists) {
            console.log('   → File WAS uploaded successfully, but did not auto-refresh');
        } else {
            console.log('   → File was NOT uploaded at all (different issue)');
        }
    }

    console.log('\n8. Cleanup: Delete test file from database...');
    // Navigate to file to select it
    const cleanup = page.locator(`button:has-text("${testFileName}")`).first();
    if (await cleanup.count() > 0) {
        await cleanup.click();
        await page.waitForTimeout(500);
        // Look for Delete button in toolbar
        const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
        if (await deleteBtn.isVisible()) {
            await deleteBtn.click();
            // Confirm delete dialog
            await page.getByRole('button', { name: /^delete$/i }).last().click();
            await page.waitForTimeout(1000);
            console.log('   Test file deleted');
        }
    }

    await browser.close();
}

main().catch(console.error);
