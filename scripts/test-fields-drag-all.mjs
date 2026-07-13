import { chromium } from 'playwright';

const baseUrl = 'http://externa-core.test';
const email = process.env.TEST_EMAIL ?? 'superadmin@example.com';
const password = process.env.TEST_PASSWORD ?? 'password';
const collectionId = process.env.TEST_COLLECTION_ID ?? '1';

async function login(page) {
    await page.goto(`${baseUrl}/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 10000,
    });
}

async function openFieldsPage(page) {
    await page.goto(`${baseUrl}/collections/${collectionId}/fields`);
    await page.waitForSelector('[data-sortable-id]', { timeout: 10000 });
    await page.setViewportSize({ width: 1280, height: 900 });
}

async function getFieldMeta(page) {
    return page.locator('[data-sortable-id]').evaluateAll((elements) =>
        elements.map((element) => ({
            name: element.getAttribute('data-field-name') ?? '',
            layoutWidth: element.getAttribute('data-layout-width') ?? 'full',
            top: element.getBoundingClientRect().top,
            left: element.getBoundingClientRect().left,
            width: element.getBoundingClientRect().width,
        })),
    );
}

async function getFieldNames(page) {
    const meta = await getFieldMeta(page);

    return meta.map((field) => field.name);
}

async function dragFieldToIndex(page, fromIndex, toIndex) {
    const items = page.locator('[data-sortable-id]');
    const fromItem = items.nth(fromIndex);

    const fromBox = await fromItem.boundingBox();

    if (!fromBox) {
        throw new Error(`Missing bounding box for drag ${fromIndex} -> ${toIndex}`);
    }

    await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2 + 12,
        { steps: 4 },
    );
    await page.waitForTimeout(150);

    const toBox = await items.nth(toIndex).boundingBox();

    if (!toBox) {
        throw new Error(`Missing target bounding box for drag ${fromIndex} -> ${toIndex}`);
    }

    const targetX = toBox.x + toBox.width / 2;
    const targetY =
        fromIndex > toIndex
            ? toBox.y + toBox.height * 0.25
            : toBox.y + toBox.height * 0.75;

    await page.mouse.move(targetX, targetY, { steps: 30 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
}

async function restoreCanonicalOrder(page) {
    let attempts = 0;

    while (attempts < 12) {
        attempts += 1;
        const names = await getFieldNames(page);

        if (names.join(',') === 'title,status,asdfasdf') {
            return;
        }

        const fullIdx = names.indexOf('asdfasdf');
        if (fullIdx !== -1 && fullIdx !== 2) {
            await dragFieldToIndex(page, fullIdx, 2);
            continue;
        }

        const titleIdx = names.indexOf('title');
        const statusIdx = names.indexOf('status');

        if (titleIdx !== -1 && statusIdx !== -1 && titleIdx > statusIdx) {
            await dragFieldToIndex(page, statusIdx, 2);
            continue;
        }

        if (names[1] !== 'status') {
            const currentStatusIdx = names.indexOf('status');
            if (currentStatusIdx > 1) {
                await dragFieldToIndex(page, currentStatusIdx, 1);
            }
            continue;
        }

        if (titleIdx > 0) {
            await dragFieldToIndex(page, titleIdx, 0);
            continue;
        }

        break;
    }

    const names = await getFieldNames(page);
    if (names.join(',') !== 'title,status,asdfasdf') {
        throw new Error(`Failed to restore canonical order, got: ${names.join(' -> ')}`);
    }
}

async function dragHalfFieldBesideTarget(page, fromName, targetName) {
    const fromItem = await fieldByName(page, fromName);
    const targetItem = await fieldByName(page, targetName);

    const fromBox = await fromItem.boundingBox();
    const targetBox = await targetItem.boundingBox();

    if (!fromBox || !targetBox) {
        throw new Error(`Missing bounding box for beside drag ${fromName} -> ${targetName}`);
    }

    await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2 + 12,
        { steps: 4 },
    );
    await page.waitForTimeout(150);

    await page.mouse.move(
        targetBox.x + targetBox.width * 0.82,
        targetBox.y + targetBox.height * 0.45,
        { steps: 30 },
    );
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
}

async function movePairedHalfFieldToFirstPosition(page, leadingHalfName, trailingHalfName) {
    let names = await getFieldNames(page);

    if (names[0] === leadingHalfName) {
        return;
    }

    const trailingHalfIndex = names.indexOf(trailingHalfName);

    if (trailingHalfIndex === -1) {
        throw new Error(`Missing trailing half field ${trailingHalfName}`);
    }

    await dragFieldToIndex(page, trailingHalfIndex, 2);
    names = await getFieldNames(page);
    const trailingHalfIndexAfterMove = names.indexOf(trailingHalfName);

    if (trailingHalfIndexAfterMove > 1) {
        await dragFieldToIndex(page, trailingHalfIndexAfterMove, 1);
    }
}

async function fieldByName(page, fieldName) {
    return page.locator(`[data-sortable-id][data-field-name="${fieldName}"]`).first();
}

async function dragHalfFieldBelowTarget(page, fromName, targetName) {
    const fromItem = await fieldByName(page, fromName);
    const targetItem = await fieldByName(page, targetName);

    const fromBox = await fromItem.boundingBox();
    const targetBox = await targetItem.boundingBox();

    if (!fromBox || !targetBox) {
        throw new Error(`Missing bounding box for vertical drag ${fromName} -> ${targetName}`);
    }

    await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height + 24,
        { steps: 6 },
    );
    await page.waitForTimeout(150);

    await page.mouse.move(
        targetBox.x + targetBox.width * 0.5,
        targetBox.y + targetBox.height * 0.92,
        { steps: 30 },
    );
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
}

async function assertOrder(page, expectedNames, label) {
    const names = await getFieldNames(page);
    const expected = expectedNames.join(' -> ');
    const actual = names.join(' -> ');

    if (actual !== expected) {
        throw new Error(`${label}: expected "${expected}", got "${actual}"`);
    }

    console.log(`  ✓ ${label}: ${actual}`);
}

async function assertHalfNarrowerThanFull(page, halfName, fullName) {
    const meta = await getFieldMeta(page);
    const halfField = meta.find((field) => field.name === halfName);
    const fullField = meta.find((field) => field.name === fullName);

    if (!halfField || !fullField) {
        throw new Error(`Could not find ${halfName} or ${fullName} for width check`);
    }

    if (halfField.width >= fullField.width * 0.95) {
        throw new Error(
            `${halfName} (${Math.round(halfField.width)}px) should be narrower than ${fullName} (${Math.round(fullField.width)}px)`,
        );
    }

    console.log(
        `  ✓ layout: ${halfName} (${Math.round(halfField.width)}px) < ${fullName} (${Math.round(fullField.width)}px)`,
    );
}

async function assertHalfFieldsStacked(page, firstHalfName, secondHalfName) {
    const meta = await getFieldMeta(page);
    const firstHalfField = meta.find((field) => field.name === firstHalfName);
    const secondHalfField = meta.find((field) => field.name === secondHalfName);

    if (!firstHalfField || !secondHalfField) {
        throw new Error(`Could not find ${firstHalfName} or ${secondHalfName} for stack check`);
    }

    if (secondHalfField.top <= firstHalfField.top + 40) {
        throw new Error(
            `${secondHalfName} should render below ${firstHalfName}, tops: ${Math.round(secondHalfField.top)} vs ${Math.round(firstHalfField.top)}`,
        );
    }

    if (Math.abs(firstHalfField.left - secondHalfField.left) > 8) {
        throw new Error(
            `${firstHalfName} and ${secondHalfName} should align in the left column when stacked`,
        );
    }

    console.log(`  ✓ stacked halves: ${firstHalfName} above ${secondHalfName}`);
}

async function assertHalfFieldStaysHalfWidthWhileDragging(page, halfName, fullName) {
    const halfItem = await fieldByName(page, halfName);
    const halfBox = await halfItem.boundingBox();

    if (!halfBox) {
        throw new Error(`Missing bounding box for half field ${halfName}`);
    }

    await page.mouse.move(
        halfBox.x + halfBox.width / 2,
        halfBox.y + halfBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        halfBox.x + halfBox.width / 2,
        halfBox.y + halfBox.height / 2 + 16,
        { steps: 4 },
    );
    await page.waitForTimeout(200);

    const metaDuringDrag = await getFieldMeta(page);
    const fullField = metaDuringDrag.find((field) => field.name === fullName);
    const idleHalfWidth = halfBox.width;

    const overlayWidth = await page.evaluate(() => {
        const ghostCard = document.querySelector('.cursor-grabbing');

        return ghostCard?.closest('[style*="width"]')?.getBoundingClientRect().width
            ?? ghostCard?.getBoundingClientRect().width
            ?? null;
    });

    const draggedHalfInList = metaDuringDrag.find((field) => field.name === halfName);

    if (fullField && draggedHalfInList && draggedHalfInList.width >= fullField.width * 0.95) {
        throw new Error(
            `${halfName} expanded to full width (${Math.round(draggedHalfInList.width)}px) during drag`,
        );
    }

    if (overlayWidth !== null && fullField && overlayWidth >= fullField.width * 0.95) {
        throw new Error(
            `Drag overlay for ${halfName} is full width (${Math.round(overlayWidth)}px) during drag`,
        );
    }

    if (draggedHalfInList && draggedHalfInList.width > idleHalfWidth * 1.15) {
        throw new Error(
            `${halfName} grew during drag: ${Math.round(idleHalfWidth)}px -> ${Math.round(draggedHalfInList.width)}px`,
        );
    }

    await page.mouse.up();
    await page.waitForTimeout(300);

    console.log(`  ✓ ${halfName} stays half-width during drag`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
    await login(page);
    await openFieldsPage(page);

    const initial = await getFieldNames(page);
    console.log('Fields:', initial.join(' -> '));

    const halfIndex = initial.indexOf('status');
    const titleIndex = initial.indexOf('title');
    const fullIndex = initial.indexOf('asdfasdf');

    if (halfIndex === -1 || titleIndex === -1 || fullIndex === -1) {
        throw new Error(
            'Collection 1 needs fields: title (half), status (half), asdfasdf (full)',
        );
    }

    let names = initial;

    console.log('\n--- Half field keeps width during drag ---');
    await assertHalfFieldStaysHalfWidthWhileDragging(page, 'title', 'asdfasdf');

    console.log('\n--- Restore canonical order: title, status, asdfasdf ---');
    await openFieldsPage(page);
    await restoreCanonicalOrder(page);
    await assertOrder(page, ['title', 'status', 'asdfasdf'], 'canonical order');

    console.log('\n--- Move half field (status) to first position ---');
    await movePairedHalfFieldToFirstPosition(page, 'status', 'title');
    names = await getFieldNames(page);
    if (names[0] !== 'status') {
        throw new Error(`Expected status first, got: ${names.join(' -> ')}`);
    }
    console.log(`  ✓ status first: ${names.join(' -> ')}`);

    console.log('\n--- Move half field (status) to last position ---');
    await restoreCanonicalOrder(page);
    names = await getFieldNames(page);
    await dragFieldToIndex(page, names.indexOf('status'), names.length - 1);
    names = await getFieldNames(page);
    if (names[names.length - 1] !== 'status') {
        throw new Error(`Expected status last, got: ${names.join(' -> ')}`);
    }
    console.log(`  ✓ status last: ${names.join(' -> ')}`);

    console.log('\n--- Move full field (asdfasdf) to first position ---');
    await restoreCanonicalOrder(page);
    names = await getFieldNames(page);
    await dragFieldToIndex(page, names.indexOf('asdfasdf'), 0);
    names = await getFieldNames(page);
    if (names[0] !== 'asdfasdf') {
        throw new Error(`Expected full field first, got: ${names.join(' -> ')}`);
    }
    console.log(`  ✓ full field first: ${names.join(' -> ')}`);

    console.log('\n--- Move half field (title) between full and half ---');
    await openFieldsPage(page);
    names = await getFieldNames(page);
    const titlePos = names.indexOf('title');
    await dragFieldToIndex(page, titlePos, 1);
    names = await getFieldNames(page);
    if (names[1] !== 'title') {
        throw new Error(`Expected title at index 1, got order: ${names.join(' -> ')}`);
    }
    console.log(`  ✓ title at middle position: ${names.join(' -> ')}`);

    console.log('\n--- Restore canonical order before layout checks ---');
    await openFieldsPage(page);
    await restoreCanonicalOrder(page);
    await assertOrder(page, ['title', 'status', 'asdfasdf'], 'canonical order');

    console.log('\n--- Layout widths after reorder ---');
    await assertHalfNarrowerThanFull(page, 'title', 'asdfasdf');
    await assertHalfNarrowerThanFull(page, 'status', 'asdfasdf');

    console.log('\n--- Stack half fields vertically (status below title) ---');
    await dragHalfFieldBelowTarget(page, 'status', 'title');
    await assertOrder(page, ['title', 'status', 'asdfasdf'], 'order unchanged when stacking');
    await assertHalfFieldsStacked(page, 'title', 'status');

    console.log('\n--- Restore side-by-side halves ---');
    await dragHalfFieldBesideTarget(page, 'status', 'title');
    await openFieldsPage(page);
    await assertHalfNarrowerThanFull(page, 'title', 'asdfasdf');
    await assertHalfNarrowerThanFull(page, 'status', 'asdfasdf');

    if (errors.length > 0) {
        throw new Error(`JavaScript errors: ${errors.join('; ')}`);
    }

    console.log('\nAll drag + layout combination tests passed.');
} catch (error) {
    console.error('\nFAILED:', error.message);
    process.exitCode = 1;
} finally {
    await browser.close();
}
