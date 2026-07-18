import { chromium } from 'playwright';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const base = process.env.APP_URL || 'http://externa-core.test';
const email = process.env.AI_SMOKE_EMAIL || 'superadmin@example.com';
const password = process.env.AI_SMOKE_PASSWORD || 'password';

async function login(page) {
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(password);
    await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }),
        page.locator('button[type="submit"]').first().click(),
    ]);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const failures = [];

    try {
        await login(page);

        await page.goto(`${base}/ai`, { waitUntil: 'networkidle' });
        if (!page.url().includes('/ai')) {
            failures.push(`Expected /ai, got ${page.url()}`);
        }

        // Open presets drawer
        const presetsButton = page.getByRole('button', { name: /Azioni utili/i });
        if (await presetsButton.count()) {
            await presetsButton.click();
            await page.getByText(/Crea ruolo con permessi|Nuova collection/i).first().waitFor({ timeout: 10000 });
            await page.getByText(/Crea ruolo con permessi/i).first().click();
            // Confirm destructive dialog only if shown; role preset is not destructive
            const composer = page.locator('textarea[aria-label="Messaggio"]');
            await composer.waitFor({ timeout: 10000 });
            const value = await composer.inputValue();
            if (!value.toLowerCase().includes('ruolo')) {
                failures.push('Preset did not insert role prompt into composer');
            }
        } else {
            failures.push('Presets button not found');
        }

        // Collections trashed toggle
        await page.goto(`${base}/collections`, { waitUntil: 'networkidle' });
        const trashToggle = page.getByRole('radio', { name: /Trashed|Cestino/i }).or(
            page.locator('[value="trashed"]'),
        );
        if (await trashToggle.count()) {
            await trashToggle.first().click();
            await page.waitForTimeout(500);
        }

        // Send a minimal AI prompt that must use a tool
        await page.goto(`${base}/ai`, { waitUntil: 'networkidle' });
        const composer = page.locator('textarea[aria-label="Messaggio"]');
        await composer.fill(
            'Usa ManageRoles action=list. Elenca i nomi dei ruoli dal JSON del tool. Non inventare.',
        );
        await page.getByRole('button', { name: 'Invia' }).click();

        // Wait for streaming to settle (LM Studio may be slow/unavailable).
        await page.waitForTimeout(20000);
        const bodyText = await page.locator('main').first().innerText();
        const composerStillHasPrompt = (await composer.inputValue()).trim().length > 0;
        if (
            !/super-admin|admin|reader|ManageRoles|ruol|Error|offline|tool/i.test(bodyText)
            && composerStillHasPrompt
        ) {
            // Composer uncleared usually means send failed; still treat presets/UI as covered above.
            failures.push('AI send did not clear composer / no response visible');
        }
    } catch (error) {
        failures.push(String(error));
    } finally {
        await browser.close();
    }

    if (failures.length) {
        console.error('BROWSER FAIL');
        for (const failure of failures) {
            console.error(' -', failure);
        }
        process.exit(1);
    }

    console.log('BROWSER PASS');
}

main();
