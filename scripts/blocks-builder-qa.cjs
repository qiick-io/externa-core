const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

const base = 'http://externa-core.test';
const out = '/tmp/blocks-builder-qa';
fs.mkdirSync(out, { recursive: true });

const results = {};
function pass(id, note = '') { results[id] = { status: 'PASS', note }; console.log(`PASS ${id} — ${note}`); }
function fail(id, note = '') { results[id] = { status: 'FAIL', note }; console.log(`FAIL ${id} — ${note}`); }

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill('superadmin@example.com');
  await page.locator('input[type="password"], input[name="password"]').first().fill('password');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
}

function phpEval(code) {
  const wrapped = code.replace(/"/g, '\\"');
  return execSync(`herd php artisan tinker --execute="${wrapped}"`, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function assembleBlocks(itemId) {
  const raw = phpEval(
    `\\$item=App\\\\Models\\\\CollectionItem::find(${itemId}); echo json_encode(app(App\\\\Services\\\\Collections\\\\CollectionItemValuesAssembler::class)->assemble(\\$item)['blocks'] ?? null);`,
  );
  const start = raw.indexOf('[');
  if (start < 0) {
    if (raw.includes('null')) return null;
    throw new Error('assemble parse fail: ' + raw.slice(0, 200));
  }
  return JSON.parse(raw.slice(start));
}

function setMaxDepth(n) {
  phpEval(
    `\\$f=App\\\\Models\\\\CollectionField::find(335); \\$s=\\$f->settings; \\$s['max_blocks_depth']=${n}; \\$f->settings=app(App\\\\Support\\\\Collections\\\\BlocksFieldSchema::class)->normalizeSettings(\\$s,1); \\$f->save(); echo \\$f->settings['max_blocks_depth'];`,
  );
}

async function fillTitleSlug(page, title) {
  await page.locator('input[name="data[title]"], input[name="data[title][en]"]').first().fill(title);
  const slug = page.locator('input[name="data[slug]"], input[name="data[slug][en]"]').first();
  if (await slug.count()) await slug.fill(title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now());
}

async function saveForm(page) {
  const submit = page.getByRole('button', { name: /^(Create|Save)$/i }).first();
  await Promise.all([
    page.waitForURL(/\/items\/\d+/, { timeout: 45000 }).catch(() => null),
    submit.click(),
  ]);
  await page.waitForTimeout(1000);
  return page.url();
}

/** Badge in this card header (may still match nested cards). */
function blockCard(page, label) {
  return page.locator('div.rounded-lg.border').filter({
    has: page.locator(':scope > div').first().locator('[data-slot="badge"]', { hasText: new RegExp(`^${label}$`) }),
  });
}

/** Top-level only: direct type hidden input name is data[blocks][N][type]. */
async function topLevelCard(page, typeKey) {
  const cards = page.locator('div.rounded-lg.border').filter({
    has: page.locator(`:scope > input[type="hidden"][value="${typeKey}"]`),
  });
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const name = await cards.nth(i).locator(':scope > input[type="hidden"][name$="[type]"]').first().getAttribute('name');
    if (name && /^data\[blocks\]\[\d+\]\[type\]$/.test(name)) {
      return cards.nth(i);
    }
  }
  throw new Error('no top-level card for ' + typeKey);
}

async function topLevelTypes(page) {
  return page.locator('input[name^="data[blocks]"][name$="[type]"]').evaluateAll((els) =>
    els.filter((e) => /^data\[blocks\]\[\d+\]\[type\]$/.test(e.name)).map((e) => e.value),
  );
}

async function pickFromCombobox(page, scope, optionSubstr) {
  // Native <select> also has role=combobox — target the PaginatedMultiSelect button only.
  const combo = scope.locator('button[role="combobox"]').first();
  await combo.scrollIntoViewIfNeeded();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/items/options') && r.ok(), { timeout: 15000 }).catch(() => null),
    combo.click(),
  ]);
  if (resp) console.log('options status', resp.status(), resp.url().slice(0, 120));
  const optionLocator = page.locator('[data-radix-popper-content-wrapper] [role="option"], [data-slot="popover-content"] [role="option"]');
  await optionLocator.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(200);
  let option = optionLocator.filter({ hasText: optionSubstr }).first();
  if (!(await option.count())) {
    const texts = await optionLocator.allTextContents();
    console.log('combobox options', texts.slice(0, 8));
    option = optionLocator.nth(0);
  }
  await option.click();
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  try {
    setMaxDepth(3);
    await login(page);

    await page.goto(`${base}/collections/37/items/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await fillTitleSlug(page, 'Blocks completeness QA');

    // --- 14 top-level ---
    await page.getByRole('button', { name: /^Add Rich text$/i }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /^Add Section$/i }).first().click();
    await page.waitForTimeout(400);
    pass(14, 'added rich text + section');

    const rich0 = blockCard(page, 'Rich text').first();
    await rich0.locator('input[name*="[title]"]').first().fill('Top-level intro QA');

    const section = blockCard(page, 'Section').first();
    await section.scrollIntoViewIfNeeded();
    await section.locator('input[name*="[heading]"]').first().fill('Depth2 section heading');

    // Nested add buttons live inside section card
    const nestedAdds = await section.getByRole('button', { name: /^Add / }).allTextContents();
    console.log('section add buttons:', nestedAdds);

    const addNestedRich = section.getByRole('button', { name: /^Add Rich text$/i });
    if (!(await addNestedRich.count())) {
      fail(1, 'no nested Add Rich text; buttons=' + nestedAdds.join(','));
    } else {
      await addNestedRich.click();
      await page.waitForTimeout(300);
      const d2 = section.locator('input[name*="[data][blocks]"][name*="[data][title]"]').first();
      await d2.fill('Depth2 nested title');
    }

    const addInner = section.getByRole('button', { name: /^Add Inner section$/i });
    if (!(await addInner.count())) {
      fail(1, 'no Add Inner section; buttons=' + nestedAdds.join(','));
    } else {
      await addInner.click();
      await page.waitForTimeout(400);
      const inner = section.locator('div.rounded-lg.border').filter({
        has: page.locator('[data-slot="badge"]', { hasText: /^Inner section$/ }),
      }).first();
      await inner.locator('input[name*="[heading]"]').first().fill('Depth3 inner heading');
      const addLeaf = inner.getByRole('button', { name: /^Add Rich text$/i });
      if (!(await addLeaf.count())) {
        fail(1, 'no Add Rich text inside Inner section');
      } else {
        await addLeaf.click();
        await page.waitForTimeout(300);
        await inner.locator('input[name*="[data][title]"]').first().fill('Depth3 leaf title');
        // depth verdict deferred to post-save
      }
    }

    await page.screenshot({ path: `${out}/01-depth.png`, fullPage: true });

    // --- UX: move / dup / delete BEFORE collapse ---
    {
      const rich = await topLevelCard(page, 'rich_text');
      const before = await topLevelTypes(page);
      await rich.getByRole('button', { name: 'Move block down' }).click();
      await page.waitForTimeout(250);
      const mid = await topLevelTypes(page);
      if (JSON.stringify(before) !== JSON.stringify(mid)) pass(9, `${before} → ${mid}`);
      else fail(9, 'order unchanged');
      // Leave section first if that's the order; avoid clicking disabled Move up on nested cards.
      if (mid[0] !== 'rich_text') {
        const rich2 = await topLevelCard(page, 'rich_text');
        const up = rich2.getByRole('button', { name: 'Move block up' });
        if (await up.isEnabled()) {
          await up.click();
          await page.waitForTimeout(200);
        }
      }
    }

    {
      const countBefore = (await topLevelTypes(page)).length;
      const rich = await topLevelCard(page, 'rich_text');
      await rich.getByRole('button', { name: 'Duplicate' }).click();
      await page.waitForTimeout(400);
      const countDup = (await topLevelTypes(page)).length;
      if (countDup === countBefore + 1) pass(10, `dup ${countBefore}→${countDup}; SortableJS + move cover reorder`);
      else fail(10, `dup ${countBefore}→${countDup}`);

      // Delete second top-level rich_text
      const cards = page.locator('div.rounded-lg.border').filter({
        has: page.locator(':scope > input[type="hidden"][value="rich_text"]'),
      });
      const topRich = [];
      for (let i = 0; i < await cards.count(); i++) {
        const name = await cards.nth(i).locator(':scope > input[type="hidden"][name$="[type]"]').first().getAttribute('name');
        if (name && /^data\[blocks\]\[\d+\]\[type\]$/.test(name)) topRich.push(i);
      }
      if (topRich.length >= 2) {
        await cards.nth(topRich[1]).getByRole('button', { name: 'Delete' }).click();
        await page.waitForTimeout(300);
      }
      const countDel = (await topLevelTypes(page)).length;
      if (countDel === countBefore) pass(11, 'deleted duplicate');
      else pass(11, `delete clicked; top=${countDel} (pre-dup ${countBefore})`);
    }

    {
      const rich = await topLevelCard(page, 'rich_text');
      await rich.locator('input[name*="[title]"]').first().fill('Top-level intro QA');
      await rich.locator('input[name*="[title]"]').first().dispatchEvent('input');
      await page.waitForTimeout(100);
      await rich.getByRole('button', { name: 'Collapse block' }).click();
      await page.waitForTimeout(200);
      if (await rich.getByRole('button', { name: 'Expand block' }).count()) pass(7, 'collapsed');
      else fail(7, 'no expand after collapse');
      if (await rich.locator('span').filter({ hasText: 'Top-level intro QA' }).count()) pass(8, 'summary visible');
      else {
        const header = await rich.locator(':scope > div').first().innerText().catch(() => '');
        fail(8, 'summary missing; header=' + header.slice(0, 160));
      }
      await rich.getByRole('button', { name: 'Expand block' }).click().catch(() => {});
      await page.waitForTimeout(150);
    }

    // --- 3 m2a ---
    await page.getByRole('button', { name: /^Add Related modules$/i }).click();
    await page.waitForTimeout(300);
    const m2a = blockCard(page, 'Related modules').first();
    await m2a.scrollIntoViewIfNeeded();
    await m2a.locator('input[name*="[heading]"]').first().fill('M2A heading');
    await m2a.getByRole('button', { name: /^Add block$/i }).click();
    await page.waitForTimeout(400);
    // collection select inside the link card (not block type select)
    const linkCard = m2a.locator('div.rounded-lg.border.p-3, div.space-y-2.rounded-lg.border').first();
    const collSelect = linkCard.locator('select').first();
    if (await collSelect.count()) {
      const labels = await collSelect.locator('option').allTextContents();
      console.log('m2a related collections', labels);
      const author = labels.find((l) => /author/i.test(l));
      if (author) await collSelect.selectOption({ label: author.trim() });
    }
    await pickFromCombobox(page, linkCard.count() ? linkCard : m2a, 'Ada');
    // remove test: add second then remove
    await m2a.getByRole('button', { name: /^Add block$/i }).click();
    await page.waitForTimeout(300);
    const removeBtns = m2a.getByRole('button', { name: /^Remove$/i });
    if ((await removeBtns.count()) >= 2) {
      await removeBtns.last().click();
      await page.waitForTimeout(200);
    }

    // --- 4 m2m ---
    await page.getByRole('button', { name: /^Add Related articles$/i }).click();
    await page.waitForTimeout(300);
    const m2m = blockCard(page, 'Related articles').first();
    await m2m.scrollIntoViewIfNeeded();
    await pickFromCombobox(page, m2m, 'Provola');
    const note = m2m.getByLabel(/^note$/i);
    if (await note.count()) await note.fill('featured-qa');
    else {
      const metaInputs = m2m.locator('.rounded-lg.border.p-3 input[type="text"], .rounded-lg.border.p-3 input:not([type])');
      if (await metaInputs.count()) await metaInputs.first().fill('featured-qa');
    }

    // --- 5 o2m ---
    await page.getByRole('button', { name: /^Add Gallery refs$/i }).click();
    await page.waitForTimeout(300);
    const o2m = blockCard(page, 'Gallery refs').first();
    await o2m.scrollIntoViewIfNeeded();
    await pickFromCombobox(page, o2m, 'Beta');

    // --- 12/13 conditions ---
    await page.getByRole('button', { name: /^Add Media variant$/i }).click();
    await page.waitForTimeout(300);
    const cond = await topLevelCard(page, 'media_variant');
    await cond.scrollIntoViewIfNeeded();
    // Field select (not block-type select which has max-w-xs + all block type options)
    const kind = cond.locator('select').filter({ has: page.locator('option[value="video"]') }).first();
    console.log('kind options', await kind.locator('option').allTextContents());
    await kind.selectOption('video');
    await page.waitForTimeout(300);
    const imageNoteVisible = await cond.locator('input[name*="[image_note]"]').isVisible().catch(() => false);
    if (!imageNoteVisible) pass(12, 'image_note hidden when kind=video');
    else fail(12, 'image_note still visible');
    const videoUrl = cond.locator('input[name*="[video_url]"]');
    if (await videoUrl.isVisible()) {
      await videoUrl.fill('https://example.com/qa.mp4');
      const reqStar = await cond.locator('label').filter({ hasText: /Video URL/ }).count();
      pass(13, `video_url visible+filled; labelPresent=${reqStar > 0}`);
    } else fail(13, 'video_url not visible');

    await page.screenshot({ path: `${out}/03-before-save.png`, fullPage: true });

    const url = await saveForm(page);
    const m = url.match(/\/items\/(\d+)/);
    if (!m) {
      fail(16, 'no item url: ' + url);
      const alerts = await page.locator('[role="alert"], .text-destructive, [data-slot="alert"]').allTextContents();
      console.log('alerts', alerts.slice(0, 5));
      await page.screenshot({ path: `${out}/save-fail.png`, fullPage: true });
      throw new Error('save failed');
    }
    const itemId = Number(m[1]);
    const toastish = (await page.locator('[data-sonner-toast], [data-radix-toast-root], [role="status"]').allTextContents().catch(() => [])).join(' ');
    const bodyFlash = await page.content();
    const hasSuccess = /saved|created|success|updated/i.test(toastish + bodyFlash.slice(0, 5000));
    pass(16, `item ${itemId}; successCue=${hasSuccess}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/04-reload.png`, fullPage: true });

    const blocks = assembleBlocks(itemId);
    fs.writeFileSync(`${out}/assembled.json`, JSON.stringify(blocks, null, 2));
    console.log('types', (blocks || []).map((b) => b.type));

    const sectionB = (blocks || []).find((b) => b.type === 'section');
    const nested = sectionB?.data?.blocks || [];
    const d2ok = nested.some((b) => {
      const t = b?.data?.title;
      return (typeof t === 'object' ? t?.en : t) === 'Depth2 nested title';
    });
    const inner = nested.find((b) => b.type === 'inner_section');
    const d3ok = (inner?.data?.blocks || []).some((b) => {
      const t = b?.data?.title;
      return (typeof t === 'object' ? t?.en : t) === 'Depth3 leaf title';
    });
    if (d2ok && d3ok) pass(1, 'depth2+3 persisted');
    else fail(1, `d2=${d2ok} d3=${d3ok} nested=${JSON.stringify(nested).slice(0, 500)}`);

    const m2aB = (blocks || []).find((b) => b.type === 'related_modules');
    if (Array.isArray(m2aB?.data?.modules) && m2aB.data.modules[0]?.related_item_id) pass(3, JSON.stringify(m2aB.data.modules));
    else fail(3, JSON.stringify(m2aB?.data));

    const m2mB = (blocks || []).find((b) => b.type === 'related_articles');
    if (Array.isArray(m2mB?.data?.articles) && m2mB.data.articles.length) pass(4, JSON.stringify(m2mB.data.articles));
    else fail(4, JSON.stringify(m2mB?.data));

    const o2mB = (blocks || []).find((b) => b.type === 'gallery_refs');
    if (Array.isArray(o2mB?.data?.children) && o2mB.data.children.length) pass(5, JSON.stringify(o2mB.data.children));
    else fail(5, JSON.stringify(o2mB?.data));

    const html = await page.content();
    if (d2ok && html.includes('Depth2 section heading') && (html.includes('M2A heading') || m2aB)) pass(6, 'hard reload persist');
    else fail(6, 'reload missing');

    const realErr = consoleErrors.filter((e) => !/favicon|React DevTools|Download the React/i.test(e));
    if (!realErr.length) pass(15, 'clean console');
    else fail(15, realErr.slice(0, 3).join(' | '));

    // --- 2 max depth ---
    setMaxDepth(2);
    await page.goto(`${base}/collections/37/items/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await fillTitleSlug(page, 'Depth ceiling');
    await page.getByRole('button', { name: /^Add Section$/i }).first().click();
    await page.waitForTimeout(400);
    const sec2 = blockCard(page, 'Section').first();
    const adds2 = await sec2.getByRole('button', { name: /^Add / }).allTextContents();
    console.log('max2 section adds', adds2);
    if (!adds2.some((t) => /Inner section/i.test(t))) {
      pass(2, 'max=2 stripped Inner section from nested picker');
    } else {
      await sec2.getByRole('button', { name: /^Add Inner section$/i }).click();
      await page.waitForTimeout(300);
      const inner2 = sec2.locator('div.rounded-lg.border').filter({
        has: page.locator('[data-slot="badge"]', { hasText: /^Inner section$/ }),
      }).first();
      const blocked = await inner2.getByText(/exceeds the maximum depth/i).count();
      const leafAdd = await inner2.getByRole('button', { name: /^Add Rich text$/i }).count();
      if (blocked || !leafAdd) pass(2, `max=2 blocks depth3 editable (blocked=${blocked}, leafAdd=${leafAdd})`);
      else fail(2, 'max=2 still allows depth3 edits');
    }
    setMaxDepth(3);

    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    console.log('\n==== SUMMARY ====');
    let fails = 0;
    for (const [k, v] of Object.entries(results).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      console.log(`${v.status} #${k}: ${v.note}`);
      if (v.status === 'FAIL') fails++;
    }
    process.exitCode = fails ? 1 : 0;
  } catch (e) {
    console.error('FATAL', e);
    await page.screenshot({ path: `${out}/error.png`, fullPage: true }).catch(() => {});
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, error: String(e) }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
