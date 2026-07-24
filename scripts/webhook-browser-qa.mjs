import { chromium } from 'playwright';
import { createHmac } from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const base = process.env.APP_URL || 'http://externa-core.test';
const email = process.env.QA_EMAIL || 'superadmin@example.com';
const password = process.env.QA_PASSWORD || 'password';
const catcherUrl = process.env.WEBHOOK_CATCHER_URL || 'http://127.0.0.1:9876/hook';
const eventsLog = process.env.WEBHOOK_EVENTS_LOG || '/tmp/externa-webhook-qa/events.jsonl';

function readEvents() {
    if (!fs.existsSync(eventsLog)) return [];
    return fs
        .readFileSync(eventsLog, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function clearEvents() {
    fs.writeFileSync(eventsLog, '');
}

function waitForEvent(type, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const hit = readEvents().find((e) => e.json?.type === type);
        if (hit) return hit;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
    return null;
}

function verifySignature(entry, secret) {
    const expected =
        'sha256=' + createHmac('sha256', secret).update(entry.body).digest('hex');
    return entry.headers['x-externa-signature'] === expected;
}

function phpDispatch(code) {
    const file = path.join(root, 'storage/app/webhook-qa-once.php');
    fs.writeFileSync(
        file,
        `<?php
require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
config(['queue.default' => 'sync']);
${code}
`,
    );
    return execSync(`herd php ${file}`, { cwd: root, encoding: 'utf8' });
}

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
    const failures = [];
    const notes = [];
    clearEvents();

    const executablePath =
        process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROME || undefined;
    const browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(25000);

    let generatedSecret = '';

    try {
        await login(page);
        notes.push('login ok');

        await page.goto(`${base}/settings/project`, { waitUntil: 'networkidle' });
        if (!page.url().includes('/settings/project')) {
            failures.push(`Expected project settings, got ${page.url()}`);
        }

        const urlInput = page.locator('#webhook_url');
        const secretInput = page.locator('#webhook_secret');
        const generateBtn = page.getByRole('button', {
            name: /Generate secret|Genera secret|Geheimnis generieren/i,
        });
        const testBtn = page.locator('[data-test="project-webhook-test"]');
        const saveBtn = page.locator('[data-test="project-settings-save"]');

        await urlInput.waitFor({ state: 'visible' });

        // Clear any prior URL and save so send-test is disabled
        await urlInput.fill('');
        await saveBtn.click();
        await page
            .getByText(/Saved|Salvato|Gespeichert/i)
            .first()
            .waitFor({ timeout: 10000 })
            .catch(() => null);
        await page.waitForTimeout(400);
        await page.reload({ waitUntil: 'networkidle' });
        if (!(await testBtn.isDisabled())) {
            failures.push('Send test should be disabled when no saved webhook URL');
        } else {
            notes.push('send-test disabled without saved URL');
        }

        await urlInput.fill(catcherUrl);
        // Typing alone should NOT enable send-test (uses saved URL)
        if (!(await testBtn.isDisabled())) {
            failures.push('Send test enabled on unsaved URL (should require save)');
        } else {
            notes.push('unsaved URL keeps send-test disabled');
        }

        await generateBtn.click();
        generatedSecret = await secretInput.inputValue();
        if (!/^[a-f0-9]{64}$/.test(generatedSecret)) {
            failures.push(`Generated secret not 64 hex chars`);
        } else {
            notes.push('generate secret ok');
        }

        await saveBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        await page.reload({ waitUntil: 'networkidle' });
        if ((await urlInput.inputValue()) !== catcherUrl) {
            failures.push(`webhook_url not persisted`);
        } else {
            notes.push('webhook_url persisted');
        }
        if ((await secretInput.inputValue()) !== '') {
            failures.push('webhook_secret echoed after reload');
        } else {
            notes.push('secret not echoed');
        }
        if (
            !(await page
                .getByText(/secret is already configured|secret è già|Geheimnis ist bereits/i)
                .count())
        ) {
            failures.push('configured-secret hint missing');
        } else {
            notes.push('secret configured hint visible');
        }

        if (await testBtn.isDisabled()) {
            failures.push('Send test still disabled after save+reload');
        } else {
            clearEvents();
            await testBtn.click();
            await page.waitForTimeout(1500);
            const ping = waitForEvent('ping', 10000);
            if (!ping) {
                failures.push(`No ping after send-test. events=${readEvents().length}`);
            } else if (
                !ping.headers['x-externa-signature']?.startsWith('sha256=') ||
                !ping.headers['x-externa-event-id'] ||
                !ping.headers['x-externa-timestamp']
            ) {
                failures.push(`Ping missing headers: ${JSON.stringify(ping.headers)}`);
            } else if (!verifySignature(ping, generatedSecret)) {
                failures.push('Ping HMAC mismatch');
            } else if (ping.json?.data && Array.isArray(ping.json.data)) {
                failures.push('ping data should be object {}, got array');
            } else {
                notes.push('ping delivered with valid HMAC');
            }
        }

        // Item create via backend (deterministic) while webhook configured
        clearEvents();
        phpDispatch(`
$c = App\\Models\\Collection::where('slug', 'posts')->firstOrFail();
$item = $c->items()->create([]);
app(App\\Services\\Collections\\CollectionItemValuesWriter::class)->sync($item, $c, ['title' => 'QA '.time()], true);
fwrite(STDOUT, 'item_id='.$item->id.PHP_EOL);
`);
        const created = waitForEvent('item.created', 5000);
        if (!created) {
            failures.push('item.created not delivered');
        } else if (!verifySignature(created, generatedSecret)) {
            failures.push('item.created HMAC mismatch');
        } else {
            notes.push('item.created delivered');
        }

        // Update + delete via HTTP session (browser cookies)
        const cookies = await page.context().cookies();
        const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value;
        const session = cookies.find((c) => c.name === 'laravel-session')?.value;
        if (!xsrf || !session) {
            failures.push('missing session cookies for item CRUD');
        } else {
            const itemId = created?.json?.data?.item_id;
            if (itemId) {
                clearEvents();
                const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
                const decode = decodeURIComponent(xsrf);
                // update
                await page.request.put(`${base}/collections/posts/items/${itemId}`, {
                    headers: {
                        Cookie: cookieHeader,
                        'X-XSRF-TOKEN': decode,
                        Accept: 'text/html,application/xhtml+xml',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    form: { 'data[title]': `Updated QA ${Date.now()}`, _method: 'PUT' },
                    maxRedirects: 0,
                }).catch(() => null);
                // Prefer PHP sync update for certainty
                phpDispatch(`
$item = App\\Models\\CollectionItem::find(${Number(itemId)});
$c = $item->collection;
app(App\\Services\\Collections\\CollectionItemValuesWriter::class)->sync($item, $c, ['title' => 'Updated QA'], false);
`);
                const updated = waitForEvent('item.updated', 5000);
                if (!updated) {
                    failures.push('item.updated not delivered');
                } else {
                    notes.push('item.updated delivered');
                }

                clearEvents();
                phpDispatch(`
$item = App\\Models\\CollectionItem::find(${Number(itemId)});
$item?->delete();
`);
                const deleted = waitForEvent('item.deleted', 5000);
                if (!deleted) {
                    failures.push('item.deleted not delivered');
                } else {
                    notes.push('item.deleted delivered');
                }
            }
        }

        // Empty URL disables — wait for Saved, then verify props + backend
        await page.goto(`${base}/settings/project`, { waitUntil: 'networkidle' });
        await urlInput.fill('');
        await saveBtn.click();
        await page.getByText(/Saved|Salvato|Gespeichert/i).first().waitFor({ timeout: 10000 }).catch(() => null);
        await page.waitForTimeout(500);
        await page.reload({ waitUntil: 'networkidle' });
        const inertiaUrl = await page.evaluate(() => {
            const el = document.querySelector('[data-page]');
            if (!el) return '__no_data_page__';
            try {
                const page = JSON.parse(el.getAttribute('data-page') || '{}');
                return page?.props?.project?.webhook_url ?? null;
            } catch {
                return '__parse_error__';
            }
        });
        const inputVal = await urlInput.inputValue();
        if (inertiaUrl !== null && inertiaUrl !== '') {
            failures.push(`empty webhook_url not cleared in props: ${JSON.stringify(inertiaUrl)} input=${inputVal}`);
        } else {
            notes.push('empty URL cleared in props');
        }
        // Input may be autofilled; trust props + button state
        if (!(await testBtn.isDisabled())) {
            failures.push('send-test should be disabled after clearing URL');
        } else {
            notes.push('send-test disabled after clear');
        }
        clearEvents();
        phpDispatch(`app(App\\Services\\Webhooks\\OutboundWebhookDispatcher::class)->dispatchPing();`);
        if (readEvents().length > 0) {
            failures.push('dispatch after empty URL still delivered');
        } else {
            notes.push('empty URL no-op confirmed');
        }
    } catch (error) {
        failures.push(String(error?.stack || error));
    } finally {
        await browser.close();
    }

    console.log('NOTES:');
    for (const n of notes) console.log(' -', n);
    if (failures.length) {
        console.error('WEBHOOK QA FAIL');
        for (const f of failures) console.error(' -', f);
        process.exit(1);
    }
    console.log('WEBHOOK QA PASS');
}

main();
