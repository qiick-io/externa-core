/**
 * Serial AI live QA for nvidia/nemotron-3-nano-4b (A–F).
 * ONE prompt at a time · wait full SSE · 5–10s pause · never parallel.
 * Abort hung turns at ~11 min.
 *
 * Run: node tests/Browser/qa-ai-live-nemotron.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.EXTERNA_URL ?? 'http://externa-core.test';
const EMAIL = process.env.EXTERNA_EMAIL ?? 'superadmin@example.com';
const PASS = process.env.EXTERNA_PASSWORD ?? 'password';
const TURN_TIMEOUT = Number(process.env.AI_TURN_TIMEOUT_MS ?? 660_000); // ~11 min
const PAUSE_MS = Number(process.env.AI_PAUSE_MS ?? 7_000);

/** @type {{ test: string, status: string, tools: string[], note: string, elapsedSec?: number }[]} */
const results = [];
const state = {
  lastAssistant: '',
  lastTools: /** @type {string[]} */ ([]),
  lastToolResults: /** @type {string[]} */ ([]),
  postsId: null,
  postsItemId: null,
  model: null,
};

function record(test, status, note = '', tools = []) {
  results.push({
    test,
    status,
    tools,
    note,
  });
  const mark = status === 'Pass' ? '✓' : status === 'Fail' ? '✗' : '○';
  console.log(
    `${mark} ${test} [${status}] tools=[${tools.join(',') || 'none'}]${note ? ` — ${note}` : ''}`,
  );
}

function pause(ms = PAUSE_MS) {
  console.log(`    … pause ${Math.round(ms / 1000)}s`);
  return new Promise((r) => setTimeout(r, ms));
}

function php(code) {
  const escaped = code.replace(/'/g, "'\\''");
  return execSync(`herd php artisan tinker --execute='${escaped}'`, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
}

async function login(page) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASS);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }).catch(() => {}),
    page.getByRole('button', { name: /log in|sign in/i }).first().click(),
  ]);
  await page.waitForTimeout(800);
  if (page.url().includes('/login')) throw new Error('still on login');
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
  return page.evaluate(async () => {
    const r = await fetch('/ai/status', { credentials: 'same-origin' });
    return r.json();
  });
}

async function assistantTexts(page) {
  return page.evaluate(() => {
    const msgs = [...document.querySelectorAll('.group\\/message')];
    if (msgs.length) {
      return msgs
        .filter((m) => m.getAttribute('data-align') !== 'end')
        .map((n) => {
          const bubble = n.querySelector('.group\\/bubble');
          const raw = (bubble?.innerText || n.innerText || '').trim();
          return raw
            .replace(/\b(Copy|Regenerate|Export PDF|Read aloud|Retry)\b/g, '')
            .trim();
        })
        .filter(Boolean);
    }
    return [];
  });
}

/**
 * Inject fetch wrapper that records SSE tool_call / tool_result names on window.__aiQaTools.
 * @param {import('playwright').Page} page
 */
async function installSseTap(page) {
  await page.addInitScript(() => {
    // @ts-expect-error window harness
    window.__aiQaTools = [];
    // @ts-expect-error window harness
    window.__aiQaToolResults = [];
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream') && !/\/ai\//.test(String(url))) {
        return res;
      }
      if (!res.body || !ct.includes('text/event-stream')) {
        return res;
      }
      const [tee1, tee2] = res.body.tee();
      (async () => {
        const reader = tee2.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n');
          buf = parts.pop() || '';
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            const type = parsed?.type;
            if (type === 'tool_call' || type === 'tool-call') {
              const name =
                parsed.tool_name ?? parsed.tool_call?.name ?? parsed.name ?? 'tool';
              // @ts-expect-error window harness
              window.__aiQaTools.push(String(name));
            }
            if (type === 'tool_result' || type === 'tool-result') {
              const name = parsed.tool_name ?? parsed.name ?? 'tool';
              // @ts-expect-error window harness
              window.__aiQaToolResults.push(String(name));
            }
          }
        }
      })().catch(() => {});
      return new Response(tee1, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    };
  });
}

/** Read tool names from last assistant row in DB (authoritative). */
function toolsFromDb() {
  try {
    const out = php(`
$m = DB::table("agent_conversation_messages")->where("role","assistant")->orderByDesc("created_at")->first();
$calls = json_decode($m->tool_calls ?? "[]", true) ?: [];
$names = [];
foreach ($calls as $c) {
  $names[] = $c["name"] ?? $c["function"]["name"] ?? $c["tool_name"] ?? null;
}
echo json_encode(array_values(array_filter($names)));
`);
    const m = out.match(/\[[\s\S]*\]/);
    if (!m) return [];
    return JSON.parse(m[0]).map(String);
  } catch {
    return [];
  }
}

async function readTapTools(page) {
  return page.evaluate(() => {
    // @ts-expect-error window harness
    const tools = [...new Set(window.__aiQaTools || [])];
    // @ts-expect-error window harness
    const results = [...new Set(window.__aiQaToolResults || [])];
    // @ts-expect-error window harness
    window.__aiQaTools = [];
    // @ts-expect-error window harness
    window.__aiQaToolResults = [];
    return { tools, results };
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
  await page.waitForTimeout(500);
  const texts = await assistantTexts(page);
  state.lastAssistant = texts[texts.length - 1] || '';
  const elapsed = Date.now() - started;
  console.log(
    `    ↳ turn ${Math.round(elapsed / 1000)}s · tools=[${state.lastTools.join(',') || 'none'}] · ${state.lastAssistant.slice(0, 200).replace(/\s+/g, ' ')}`,
  );
  if (
    /no response from the assistant|AI stream (interrupted|connection)|Maximum execution time/i.test(
      state.lastAssistant,
    )
  ) {
    throw new Error(`assistant error: ${state.lastAssistant.slice(0, 240)}`);
  }
  return { text: state.lastAssistant, elapsedSec: Math.round(elapsed / 1000) };
}

async function sendPrompt(page, message) {
  const previousText = state.lastAssistant;
  // reset tap buffers
  await page.evaluate(() => {
    // @ts-expect-error window harness
    window.__aiQaTools = [];
    // @ts-expect-error window harness
    window.__aiQaToolResults = [];
  }).catch(() => {});
  const composer = page.getByLabel(/message/i).first();
  await composer.click();
  await composer.fill(message);
  await page.getByRole('button', { name: /send/i }).click();
  await page.waitForTimeout(300);
  const turn = await waitForTurn(page, { previousText });
  await page.waitForTimeout(600);
  const tap = await readTapTools(page).catch(() => ({ tools: [], results: [] }));
  const dbTools = toolsFromDb();
  state.lastTools = [...new Set([...tap.tools, ...dbTools])];
  state.lastToolResults = [...new Set(tap.results)];
  return { ...turn, tools: state.lastTools, toolResults: state.lastToolResults };
}

function looksItalian(text) {
  const t = text.toLowerCase();
  const italianMarkers = (
    t.match(
      /\b(è|sono|una|un|il|la|lo|gli|della|dello|sistema|contenuti|gestione|per|con|che|non|può|puo|cms)\b/g,
    ) || []
  ).length;
  const hasAccent = /[àèéìòù]/i.test(text);
  return italianMarkers >= 2 || (hasAccent && italianMarkers >= 1) || /\bcms\b/i.test(text);
}

function toolInvoked(tools, needle = /ManageCollections|DescribeFieldTypes/i) {
  return tools.some((t) => needle.test(t));
}

async function main() {
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
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('BROWSER_ERR', msg.text().slice(0, 220));
  });
  await installSseTap(page);

  // Setup
  try {
    await login(page);
    await gotoAi(page);
    const status = await waitAiOnline(page);
    state.model = status.model;
    console.log(`Setup online=${status.online} model=${status.model}`);
    if (!status.online) throw new Error(`AI offline: ${JSON.stringify(status)}`);
    if (!String(status.model || '').includes('nemotron')) {
      throw new Error(`unexpected model: ${status.model}`);
    }
    record('Setup /ai/status', 'Pass', `online:true, model:${status.model}`);
  } catch (e) {
    record('Setup /ai/status', 'Fail', String(e.message || e).slice(0, 300));
    await browser.close();
    writeResults();
    process.exit(1);
  }

  await pause();

  // A — Simple Italian Q&A (no tools)
  try {
    await gotoAi(page);
    const turn = await sendPrompt(
      page,
      "Rispondi SOLO in italiano, in una sola frase breve: cos'è un CMS? Non usare tool.",
    );
    if (!looksItalian(turn.text)) {
      throw new Error(`Not clearly Italian: ${turn.text.slice(0, 200)}`);
    }
    record(
      'A. Simple Italian Q&A',
      'Pass',
      `Full SSE ${turn.elapsedSec}s; ${turn.text.slice(0, 120).replace(/\s+/g, ' ')}`,
      turn.tools,
    );
  } catch (e) {
    record('A. Simple Italian Q&A', 'Fail', String(e.message || e).slice(0, 320), state.lastTools);
  }

  await pause();

  // B — List collections MUST use ManageCollections
  let bOk = false;
  try {
    const turn = await sendPrompt(
      page,
      'Usa lo strumento ManageCollections con action=list e dimmi id+nome di almeno 3 collection. Non inventare i dati: chiama il tool.',
    );
    const used = toolInvoked(turn.tools, /ManageCollections/i);
    const mentionsData =
      /posts|\b\d+\b|collection/i.test(turn.text) && turn.text.length > 20;
    if (!used) {
      throw new Error(
        `NO tool invoke. Reply: ${turn.text.slice(0, 220)}`,
      );
    }
    if (!mentionsData) {
      throw new Error(`Tool used but empty/useless reply: ${turn.text.slice(0, 220)}`);
    }
    bOk = true;
    record(
      'B. List collections (ManageCollections)',
      'Pass',
      `Tools invoked; ${turn.elapsedSec}s; ${turn.text.slice(0, 140).replace(/\s+/g, ' ')}`,
      turn.tools,
    );
  } catch (e) {
    record(
      'B. List collections (ManageCollections)',
      'Fail',
      String(e.message || e).slice(0, 360),
      state.lastTools,
    );
  }

  await pause();

  // C — Get one collection or DescribeFieldTypes
  if (!bOk) {
    record('C. Get collection / DescribeFieldTypes', 'Skipped', 'Blocked: B did not use tools');
  } else {
    try {
      const colId = state.postsId ?? 1;
      const turn = await sendPrompt(
        page,
        `Usa ManageCollections action=get con collection_id=${colId} (oppure DescribeFieldTypes se serve). Riassumi nome, slug e campi. Non inventare.`,
      );
      const used = toolInvoked(turn.tools, /ManageCollections|DescribeFieldTypes/i);
      if (!used) throw new Error(`NO tool invoke. Reply: ${turn.text.slice(0, 220)}`);
      record(
        'C. Get collection / DescribeFieldTypes',
        'Pass',
        `${turn.elapsedSec}s; ${turn.text.slice(0, 140).replace(/\s+/g, ' ')}`,
        turn.tools,
      );
    } catch (e) {
      record(
        'C. Get collection / DescribeFieldTypes',
        'Fail',
        String(e.message || e).slice(0, 360),
        state.lastTools,
      );
    }
  }

  await pause();

  // D — list_field_packs / list_collection_packs
  let dOk = false;
  try {
    const turn = await sendPrompt(
      page,
      'Usa ManageCollections con action=list_field_packs e action=list_collection_packs (due chiamate o una dopo l\'altra). Elenca le chiavi pack disponibili. Non inventare.',
    );
    const used = toolInvoked(turn.tools, /ManageCollections/i);
    const packish = /pack|seo|articles|publishing|field_pack|collection_pack/i.test(turn.text);
    if (!used) throw new Error(`NO tool invoke. Reply: ${turn.text.slice(0, 220)}`);
    if (!packish) {
      throw new Error(`Tool used but no pack keys in reply: ${turn.text.slice(0, 220)}`);
    }
    dOk = true;
    record(
      'D. list_field_packs / list_collection_packs',
      'Pass',
      `${turn.elapsedSec}s; ${turn.text.slice(0, 140).replace(/\s+/g, ' ')}`,
      turn.tools,
    );
  } catch (e) {
    record(
      'D. list_field_packs / list_collection_packs',
      'Fail',
      String(e.message || e).slice(0, 360),
      state.lastTools,
    );
  }

  await pause();

  // E — Light query items
  if (!bOk && !dOk) {
    record('E. Query items', 'Skipped', 'Stopped early after tool path failed');
  } else {
    try {
      const colId = state.postsId ?? 1;
      const turn = await sendPrompt(
        page,
        `Usa ManageCollectionItems action=list con collection_id=${colId} e limit=3. Riassumi brevemente gli item (id/title se c'è). Non inventare.`,
      );
      const used = toolInvoked(
        turn.tools,
        /QueryCollectionItems|ManageCollectionItems|ManageCollections/i,
      );
      if (!used) throw new Error(`NO tool invoke. Reply: ${turn.text.slice(0, 220)}`);
      record(
        'E. Query items',
        'Pass',
        `${turn.elapsedSec}s; ${turn.text.slice(0, 140).replace(/\s+/g, ' ')}`,
        turn.tools,
      );
    } catch (e) {
      record('E. Query items', 'Fail', String(e.message || e).slice(0, 360), state.lastTools);
    }
  }

  await pause();

  // F — Copy on short reply
  try {
    await gotoAi(page);
    await sendPrompt(page, 'Reply with exactly: AI_LIVE_OK');
    const copy = page.locator('button[aria-label="Copy"]:not([disabled])').last();
    await copy.waitFor({ timeout: 10000 });
    await copy.click();
    await page.waitForTimeout(300);
    record('F. Message actions (Copy)', 'Pass', 'Copy clickable on short assistant reply');
  } catch (e) {
    record('F. Message actions (Copy)', 'Fail', String(e.message || e).slice(0, 320));
  }

  await browser.close();
  writeResults();
  const failed = results.filter((r) => r.status === 'Fail').length;
  process.exit(failed > 0 ? 1 : 0);
}

function writeResults() {
  const anyTools = results.some((r) => (r.tools?.length ?? 0) > 0);
  const summary = {
    at: new Date().toISOString(),
    model: state.model,
    toolsActuallyInvoked: anyTools,
    turnTimeoutMs: TURN_TIMEOUT,
    pauseMs: PAUSE_MS,
    results,
    passed: results.filter((r) => r.status === 'Pass').length,
    failed: results.filter((r) => r.status === 'Fail').length,
    skipped: results.filter((r) => r.status === 'Skipped').length,
  };
  writeFileSync('storage/app/qa-ai-live-nemotron-results.json', JSON.stringify(summary, null, 2));
  console.log('\n=== NEMOTRON AI LIVE SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  writeResults();
  process.exit(2);
});
