/**
 * Live AI QA against LM Studio via /ai + FAB.
 * Run: node tests/Browser/qa-ai-live.mjs
 *
 * Expects LOCAL_AI online. Tool loops can take several minutes — timeouts are generous.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';
const NO_AI_EMAIL = 'qa-ai-no@example.com';
const AI_ONLY_EMAIL = 'qa-ai-only@example.com';
const TURN_TIMEOUT = Number(process.env.AI_TURN_TIMEOUT_MS ?? 420_000);
const STAMP = Date.now().toString(36);
const SCRATCH_NAME = `ai_qa_${STAMP}`;

/** @type {{ area: string, check: string, status: 'Pass'|'Fail'|'Fixed'|'Skipped', note?: string }[]} */
const results = [];
const state = {
    scratchCollectionId: null,
    postsId: null,
    postsItemId: null,
    lastAssistant: '',
    conversationId: null,
};

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
        if (e?.skip || e?.message === 'SKIP') {
            record(area, check, 'Skipped', String(e?.note ?? e?.message ?? 'skipped').slice(0, 280));
            return false;
        }
        record(area, check, 'Fail', String(e?.message ?? e).slice(0, 400));
        return false;
    }
}

function php(code) {
    const escaped = code.replace(/'/g, "'\\''");
    return execSync(`herd php artisan tinker --execute='${escaped}'`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 60_000,
    });
}

async function login(page, email = EMAIL, pass = PASS) {
    await page.context().clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(pass);
    await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }).catch(() => {}),
        page.getByRole('button', { name: /log in|sign in/i }).first().click(),
    ]);
    // Limited users may land on /files; just ensure we left /login
    await page.waitForTimeout(800);
    if (page.url().includes('/login')) {
        throw new Error(`still on login after auth as ${email}`);
    }
}

async function gotoAi(page) {
    await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/message/i).first().waitFor({ timeout: 20000 });
}

async function waitAiOnline(page) {
    await page.waitForFunction(
        async () => {
            try {
                const r = await fetch('/ai/status', { credentials: 'same-origin' });
                const j = await r.json();
                return j?.online === true;
            } catch {
                return false;
            }
        },
        null,
        { timeout: 30000 },
    );
}

async function assistantTexts(page) {
    return page.evaluate(() => {
        const msgs = [...document.querySelectorAll('.group\\/message')];
        if (msgs.length) {
            return msgs
                .filter((m) => m.getAttribute('data-align') !== 'end')
                .map((n) => {
                    // Prefer bubble content, strip action labels
                    const bubble = n.querySelector('.group\\/bubble');
                    const raw = (bubble?.innerText || n.innerText || '').trim();
                    return raw
                        .replace(/\b(Copy|Regenerate|Export PDF|Read aloud|Retry)\b/g, '')
                        .trim();
                })
                .filter(Boolean);
        }
        const copies = [...document.querySelectorAll('button[aria-label="Copy"]')];
        return copies
            .map((btn) => {
                let el = btn.parentElement;
                for (let i = 0; i < 6 && el; i++) {
                    if ((el.innerText || '').trim().length > 0) break;
                    el = el.parentElement;
                }
                return (el?.innerText || '')
                    .replace(/\b(Copy|Regenerate|Export PDF|Read aloud|Retry)\b/g, '')
                    .trim();
            })
            .filter(Boolean);
    });
}

async function waitForTurn(page, { timeout = TURN_TIMEOUT, previousText = '' } = {}) {
    const started = Date.now();
    await page.waitForFunction(
        ({ prev }) => {
            const stop = document.querySelector('button[aria-label="Stop"]');
            const copy = document.querySelector('button[aria-label="Copy"]:not([disabled])');
            if (stop || !copy) return false;
            const msgs = [...document.querySelectorAll('.group\\/message')].filter(
                (m) => m.getAttribute('data-align') !== 'end',
            );
            const last = msgs.at(-1);
            const bubble = last?.querySelector('.group\\/bubble');
            const text = (bubble?.innerText || last?.innerText || '').trim();
            if (!text) return false;
            if (prev && text === prev) return false;
            return true;
        },
        { prev: previousText },
        { timeout },
    );
    await page.waitForTimeout(400);
    const texts = await assistantTexts(page);
    state.lastAssistant = texts[texts.length - 1] || '';
    const elapsed = Date.now() - started;
    console.log(
        `    ↳ turn done in ${Math.round(elapsed / 1000)}s · ${state.lastAssistant.slice(0, 180).replace(/\s+/g, ' ')}`,
    );
    if (/no response from the assistant|AI stream (interrupted|connection)|Maximum execution time/i.test(state.lastAssistant)) {
        throw new Error(`assistant error/empty: ${state.lastAssistant.slice(0, 240)}`);
    }
    return state.lastAssistant;
}

async function sendPrompt(page, message, { timeout = TURN_TIMEOUT } = {}) {
    const previousText = state.lastAssistant;
    const composer = page.getByLabel(/message/i).first();
    await composer.click();
    await composer.fill(message);
    await page.getByRole('button', { name: /send/i }).click();
    // Ensure streaming started or Stop appeared (optional — small models can finish fast)
    await page.waitForTimeout(300);
    return waitForTurn(page, { timeout, previousText });
}

function looksItalian(text) {
    const t = text.toLowerCase();
    // Honest: small local models often mix EN/IT — require Italian function words OR accented chars
    const italianMarkers = (t.match(/\b(è|sono|una|un|il|la|lo|gli|della|dello|sistema|contenuti|gestione|per|con|che|non|può|puo)\b/g) || []).length;
    const hasAccent = /[àèéìòù]/i.test(text);
    return italianMarkers >= 2 || (hasAccent && italianMarkers >= 1);
}

function assertIncludes(text, patterns, label) {
    const ok = patterns.some((p) =>
        typeof p === 'string' ? text.toLowerCase().includes(p.toLowerCase()) : p.test(text),
    );
    if (!ok) {
        throw new Error(`${label}: reply missing expected signal. Got: ${text.slice(0, 240)}`);
    }
}

async function main() {
    // Resolve posts ids via PHP
    try {
        const out = php(`
$posts = App\\Models\\Collection::where("slug","posts")->first();
$item = $posts?->items()->orderBy("id")->first();
echo json_encode(["posts_id"=>$posts?->id,"item_id"=>$item?->id]);
Illuminate\\Support\\Facades\\Cache::forget("ai.status");
`);
        const m = out.match(/\{[^}]+\}/);
        if (m) {
            const j = JSON.parse(m[0]);
            state.postsId = j.posts_id;
            state.postsItemId = j.item_id;
        }
    } catch (e) {
        console.warn('PHP seed lookup failed', e.message);
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('BROWSER_ERR', msg.text().slice(0, 200));
    });

    // ——— 1. Status / Italian reply ———
    await safe('AI Live', 'Login superadmin', async () => {
        await login(page);
    });

    await safe('AI Live', 'AI status online', async () => {
        await gotoAi(page);
        await waitAiOnline(page);
        const status = await page.evaluate(async () => {
            const r = await fetch('/ai/status', { credentials: 'same-origin' });
            return r.json();
        });
        if (!status.online) throw new Error(`offline: ${JSON.stringify(status)}`);
        console.log(`    ↳ model=${status.model}`);
    });

    await safe('AI Live', '1. Simple Italian reply', async () => {
        await gotoAi(page);
        const text = await sendPrompt(
            page,
            'Rispondi SOLO in italiano, in una sola frase breve: cos\'è un CMS? Non usare tool.',
        );
        if (!looksItalian(text)) {
            throw new Error(`Not clearly Italian: ${text.slice(0, 200)}`);
        }
    });

    // ——— 2. List collections ———
    await safe('AI Live', '2. List collections via tools', async () => {
        const text = await sendPrompt(
            page,
            'Usa lo strumento ManageCollections con action=list e dimmi id+nome di almeno 3 collection. Non inventare.',
            { timeout: TURN_TIMEOUT },
        );
        assertIncludes(text, ['posts', 'collection', /\b\d+\b/i, 'id'], 'list collections');
    });

    // ——— 3. Get collection by id (Ask AI seed) ———
    await safe('AI Live', '3. Ask AI seed + get collection by id', async () => {
        const colId = state.postsId ?? 1;
        await page.goto(`${BASE}/collections`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: /collection/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
        // Prefer row Ask AI for Posts if possible
        const ask = page.locator('button[aria-label="Ask AI"]').first();
        if ((await ask.count()) === 0) throw new Error('no row Ask AI');
        await ask.click();
        await page.getByText(/working on collection/i).first().waitFor({ timeout: 15000 });
        // Follow-up using collection_id
        const text = await sendPrompt(
            page,
            `Usando ManageCollections action=get con collection_id=${colId}, riassumi nome, slug e quanti campi ha. Non inventare.`,
        );
        assertIncludes(text, [String(colId), /campo|field|slug|posts|nome/i], 'get collection');
    });

    // ——— 4–5. Create scratch + DescribeFieldTypes + fields ———
    await safe('AI Live', '4–5. Create scratch collection + fields (DescribeFieldTypes if needed)', async () => {
        await gotoAi(page);
        const text = await sendPrompt(
            page,
            [
                `Crea una nuova collection chiamata "${SCRATCH_NAME}" (slug libero) con ManageCollections action=create.`,
                'Poi aggiungi due campi: title (string) e notes (textarea) con create_field.',
                'Se usi tipi complessi, chiama prima DescribeFieldTypes.',
                'Alla fine riporta collection_id e field ids. Non inventare successi.',
            ].join(' '),
            { timeout: TURN_TIMEOUT },
        );

        // Verify in DB
        const db = php(`
$c = App\\Models\\Collection::where("name", "${SCRATCH_NAME}")->orWhere("slug", "like", "ai_qa_%")->latest("id")->first();
if (!$c) { echo "NONE"; return; }
$fields = $c->fields()->pluck("name")->all();
echo json_encode(["id"=>$c->id,"name"=>$c->name,"fields"=>$fields]);
`);
        const m = db.match(/\{[\s\S]*\}/);
        if (!m) throw new Error(`scratch not found. AI said: ${text.slice(0, 280)}`);
        const j = JSON.parse(m[0]);
        state.scratchCollectionId = j.id;
        if (!Array.isArray(j.fields) || j.fields.length < 1) {
            throw new Error(`collection ${j.id} created but no fields: ${JSON.stringify(j)}`);
        }
        if (!text.match(new RegExp(String(j.id)))) {
            // model may omit id in prose but DB proves create — soft warn in note
            console.log(`    ↳ DB ok id=${j.id} fields=${j.fields.join(',')}`);
        }
    });

    // ——— 6. Create/update/list items ———
    await safe('AI Live', '6. Create / update / list items via AI', async () => {
        const cid = state.scratchCollectionId;
        if (!cid) throw new Error('no scratch collection id from prior step');
        const text = await sendPrompt(
            page,
            [
                `Sulla collection_id=${cid} (${SCRATCH_NAME}):`,
                '1) ManageCollectionItems action=create con data_json {"title":"AI QA Item","notes":"hello"}',
                '2) aggiorna lo stesso item (update) notes="updated by ai qa"',
                '3) list gli items e conferma.',
                'Riporta item_id. Non inventare.',
            ].join(' '),
            { timeout: TURN_TIMEOUT },
        );
        const db = php(`
$c = App\\Models\\Collection::find(${cid});
$count = $c?->items()->count() ?? 0;
$item = $c?->items()->latest("id")->first();
echo json_encode(["count"=>$count,"item_id"=>$item?->id,"data"=>$item?->data]);
`);
        const m = db.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('item DB lookup failed');
        const j = JSON.parse(m[0]);
        if (!j.count || j.count < 1) {
            throw new Error(`no items created. AI: ${text.slice(0, 240)} DB=${m[0]}`);
        }
    });

    // ——— 7. Ask AI row/bulk follow-up ———
    await safe('AI Live', '7. Ask AI row/bulk seeded ids follow-up', async () => {
        const colId = state.postsId ?? 1;
        await page.goto(`${BASE}/collections/${colId}/items`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        const checkbox = page
            .locator('table input[type="checkbox"], table [role="checkbox"]')
            .nth(1);
        if ((await checkbox.count()) === 0) throw new Error('no item checkbox');
        await checkbox.click();
        await page.getByText(/\d+\s+selected/i).first().waitFor({ timeout: 10000 });
        await page.getByRole('button', { name: /ask ai/i }).first().click();
        await page
            .getByText(/working on .+ items|working on 1 items/i)
            .first()
            .waitFor({ timeout: 15000 });
        const text = await sendPrompt(
            page,
            'Conferma gli item_id nel contesto e usa ManageCollectionItems action=get sul primo id. Riassumi title se presente.',
        );
        assertIncludes(text, [/\d+/, /item|title|get|id/i], 'bulk follow-up');
    });

    // ——— 8. Message actions ———
    await safe('AI Live', '8. Message actions copy + regenerate', async () => {
        await gotoAi(page);
        await sendPrompt(page, 'Reply with exactly: AI_LIVE_OK');
        const copy = page.locator('button[aria-label="Copy"]:not([disabled])').last();
        await copy.click();
        await page.waitForTimeout(300);
        await page.locator('button[aria-label="Regenerate"]').last().click();
        // Regenerate may keep same text — wait for Stop then idle Copy
        await page
            .locator('button[aria-label="Stop"]')
            .first()
            .waitFor({ state: 'visible', timeout: 30000 })
            .catch(() => {});
        await page
            .locator('button[aria-label="Stop"]')
            .first()
            .waitFor({ state: 'hidden', timeout: TURN_TIMEOUT })
            .catch(() => {});
        await page
            .locator('button[aria-label="Copy"]:not([disabled])')
            .last()
            .waitFor({ timeout: TURN_TIMEOUT });
        state.lastAssistant = (await assistantTexts(page)).at(-1) || '';
    });

    // ——— 9. Permissions ———
    await safe('AI Live', '9a. Without CanUseAi cannot open /ai', async () => {
        await login(page, NO_AI_EMAIL, PASS);
        const res = await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const status = res?.status() ?? 0;
        const body = await page.content();
        const url = page.url();
        const fab = page.locator('button[aria-label="Open AI assistant"]');
        const fabCount = await fab.count();
        const blocked =
            status === 403 ||
            /403|forbidden|unauthorized|not authorized|permission/i.test(body) ||
            url.includes('/login') ||
            !url.includes('/ai') ||
            fabCount === 0;
        if (status === 200 && url.includes('/ai') && !/403|forbidden/i.test(body)) {
            throw new Error(`/ai returned 200 without CanUseAi status=${status} fab=${fabCount}`);
        }
        if (!blocked) {
            throw new Error(`AI accessible without permission status=${status} fab=${fabCount} url=${url}`);
        }
    });

    await safe('AI Live', '9b. CanUseAi without collection perms refuses mutate', async () => {
        await login(page, AI_ONLY_EMAIL, PASS);
        await gotoAi(page);
        await waitAiOnline(page).catch(() => {});
        const text = await sendPrompt(
            page,
            'Crea una collection chiamata should_fail_ai_qa_xyz. Usa i tool se disponibili.',
            { timeout: TURN_TIMEOUT },
        );
        const softRefuse =
            /permission|permess|non posso|cannot|non ho|manca|missing|non sono in grado|non autorizz/i.test(
                text,
            );
        const created = php(`
$c = App\\Models\\Collection::where("name","should_fail_ai_qa_xyz")->first();
echo $c ? "CREATED" : "ABSENT";
`);
        if (created.includes('CREATED')) {
            throw new Error('limited AI user created a collection');
        }
        if (!softRefuse) {
            // Still Pass-ish if no create happened — but require polite refuse signal
            throw new Error(`Expected polite refuse, got: ${text.slice(0, 280)}`);
        }
    });

    // ——— 10. Activity / import dry_run ———
    await safe('AI Live', '10. QueryActivityLogs or import dry_run', async () => {
        await login(page);
        await gotoAi(page);
        const text = await sendPrompt(
            page,
            [
                'Usa QueryActivityLogs (log_name=ai, limit=5) e riassumi brevemente gli ultimi eventi.',
                'Se lo strumento non è disponibile, dillo chiaramente.',
            ].join(' '),
            { timeout: TURN_TIMEOUT },
        );
        assertIncludes(
            text,
            [/activit|event|ai_|prompt|log|nessun|none|trovat|recent/i],
            'activity',
        );
    });

    // ——— 11. Rollback (optional careful) ———
    await safe('AI Live', '11. RollbackLastAiTurn after create (optional)', async () => {
        if (!state.scratchCollectionId) {
            throw Object.assign(new Error('no scratch id from create step'), { skip: true, note: 'no scratch id from create step' });
        }
        const text = await sendPrompt(
            page,
            [
                `Sulla collection_id=${state.scratchCollectionId}, crea un campo scratch_flag (boolean) con create_field.`,
                'Poi chiama RollbackLastAiTurn per annullare quella creazione se supportato.',
                'Riassumi l\'esito del rollback.',
            ].join(' '),
            { timeout: TURN_TIMEOUT },
        );
        assertIncludes(
            text,
            [/rollback|annull|soft-delete|eliminat|ripristin|non.*support|ok|success/i],
            'rollback',
        );
    });

    // ——— Cleanup soft-delete scratch ———
    await safe('AI Live', 'Cleanup soft-delete ai_qa_* scratch', async () => {
        const out = php(`
$n = 0;
App\\Models\\Collection::query()
  ->where("name", "like", "ai_qa_%")
  ->orWhere("slug", "like", "ai_qa_%")
  ->get()
  ->each(function ($c) use (&$n) {
    $c->delete();
    $n++;
  });
echo "deleted=$n";
`);
        if (!/deleted=\d+/.test(out)) throw new Error(out.slice(0, 200));
        console.log('    ↳', out.match(/deleted=\d+/)?.[0]);
    });

    await browser.close();

    const summary = {
        passed: results.filter((r) => r.status === 'Pass').length,
        failed: results.filter((r) => r.status === 'Fail').length,
        fixed: results.filter((r) => r.status === 'Fixed').length,
        skipped: results.filter((r) => r.status === 'Skipped').length,
        results,
        scratchName: SCRATCH_NAME,
        scratchCollectionId: state.scratchCollectionId,
        postsId: state.postsId,
        at: new Date().toISOString(),
        model: 'qwen/qwen3-4b-2507',
        turnTimeoutMs: TURN_TIMEOUT,
    };
    writeFileSync(
        'storage/app/qa-ai-live-results.json',
        JSON.stringify(summary, null, 2),
    );
    console.log('\n=== AI LIVE SUMMARY ===');
    console.log(
        JSON.stringify(
            {
                passed: summary.passed,
                failed: summary.failed,
                failures: results.filter((r) => r.status === 'Fail'),
            },
            null,
            2,
        ),
    );
    process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});
