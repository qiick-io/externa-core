/**
 * Comprehensive E2E test for all collection field types.
 * Run: source ~/.nvm/nvm.sh && nvm use && node scripts/test-all-fields-e2e.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://externa-core.test';
const email = process.env.TEST_EMAIL ?? 'superadmin@example.com';
const password = process.env.TEST_PASSWORD ?? 'password';
const timestamp = Date.now();
const screenshotDir = path.join('scripts', 'e2e-screenshots', String(timestamp));

/** @type {Record<string, { pass: boolean; error?: string; skipped?: boolean; note?: string }>} */
const results = {};

const OPTION_TYPES = new Set([
    'select',
    'multiselect',
    'radio_group',
    'autocomplete',
    'checkbox_group',
    'checkbox_group_tree',
]);

const RELATION_TYPES = new Set([
    'many_to_one',
    'one_to_many',
    'many_to_many',
    'relation_tree',
    'relation',
    'relation_many',
]);

/** Field types shown in the UI type picker (COLLECTION_FIELD_TYPE_GROUPS). */
const UI_FIELD_TYPES = [
    'string',
    'autocomplete',
    'api_autocomplete',
    'code',
    'textarea',
    'wysiwyg',
    'markdown',
    'tag',
    'number',
    'boolean',
    'date',
    'map',
    'color',
    'select',
    'multiselect',
    'checkbox_group',
    'checkbox_group_tree',
    'radio_group',
    'image',
    'files',
    'm2a',
    'many_to_many',
    'one_to_many',
    'relation_tree',
    'many_to_one',
    'hash',
    'slider',
];

/** Legacy types — created via API, item form tested in UI. */
const API_ONLY_FIELD_TYPES = ['file', 'relation', 'relation_many'];

const FIELD_TYPE_LABELS = {
    string: 'Text Input',
    autocomplete: 'Combobox (static)',
    api_autocomplete: 'Autocomplete (API)',
    code: 'Codice',
    textarea: 'TextArea',
    wysiwyg: 'WYSIWYG',
    markdown: 'Markdown',
    tag: 'Tag',
    number: 'Number',
    boolean: 'Toggle',
    date: 'DateTime Picker',
    map: 'Map',
    color: 'Color Picker',
    select: 'Select',
    multiselect: 'Multi Select',
    checkbox_group: 'Checkbox Group',
    checkbox_group_tree: 'Checkbox Group Tree',
    radio_group: 'Radio Group',
    image: 'Image',
    files: 'Files',
    m2a: 'Costruttore (M2A)',
    many_to_many: 'Molti a Molti',
    one_to_many: 'Uno a Molti',
    relation_tree: 'Struttura ad albero',
    many_to_one: 'Molti a Uno',
    hash: 'Hash',
    slider: 'Cursore',
    file: 'File',
    relation: 'Relation',
    relation_many: 'Relation (many)',
};

function phpEval(expression) {
    const output = execFileSync('php84', ['artisan', 'tinker', '--execute', expression], {
        encoding: 'utf8',
        cwd: process.cwd(),
    });

    return output.trim();
}

function markResult(fieldType, pass, error = undefined, extra = {}) {
    results[fieldType] = { pass, error, ...extra };
}

async function login(page) {
    await page.goto(`${baseUrl}/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function browserFormRequest(page, url, method, formEntries) {
    const entries = Array.isArray(formEntries)
        ? formEntries
        : Object.entries(formEntries);

    return page.evaluate(
        async ({ requestUrl, requestMethod, entries: requestEntries }) => {
            const csrfToken = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');

            const body = new FormData();
            for (const [key, value] of requestEntries) {
                body.append(key, value);
            }

            const requestInit =
                requestMethod.toUpperCase() === 'DELETE'
                    ? {
                          method: 'POST',
                          body: (() => {
                              const deleteBody = new FormData();
                              deleteBody.append('_method', 'DELETE');
                              if (csrfToken) {
                                  deleteBody.append('_token', csrfToken);
                              }

                              return deleteBody;
                          })(),
                      }
                    : {
                          method: requestMethod.toUpperCase(),
                          body,
                      };

            const response = await fetch(requestUrl, {
                ...requestInit,
                headers: {
                    'X-CSRF-TOKEN': csrfToken ?? '',
                    'X-Requested-With': 'XMLHttpRequest',
                    Accept: 'text/html, application/xhtml+xml',
                },
                credentials: 'same-origin',
                redirect: 'manual',
            });

            return {
                status: response.status,
                location: response.headers.get('Location'),
            };
        },
        { requestUrl: url, requestMethod: method, entries },
    );
}

async function inertiaPost(page, url, data) {
    return browserFormRequest(page, url, 'POST', Object.entries(data));
}

async function inertiaDelete(page, url) {
    return browserFormRequest(page, url, 'DELETE', []);
}

async function createCollectionViaApi(page, name, slug) {
    await page.goto(`${baseUrl}/collections`);
    const response = await inertiaPost(page, `${baseUrl}/collections`, {
        name,
        slug,
        is_singleton: '0',
    });

    if (response.status >= 400) {
        throw new Error(`Collection create failed: HTTP ${response.status}`);
    }

    const location = response.location ?? '';
    const match = location.match(/\/collections\/(\d+)/);
    if (match) {
        return Number(match[1]);
    }

    const created = phpEval(
        `echo \\App\\Models\\Collection::query()->where('slug', '${slug}')->value('id');`,
    );
    if (!created) {
        throw new Error(`Could not resolve collection id for slug ${slug}`);
    }

    return Number(created);
}

async function openAddFieldDrawer(page) {
    await page.locator('button').filter({ hasText: 'Create field' }).first().click();
    await page.getByText('Choose a field type').waitFor({ state: 'visible', timeout: 10000 });
}

async function submitFieldForm(page, mode = 'create') {
    const submitButton = page
        .locator('[data-slot="drawer-footer"] button[type="submit"]')
        .last();
    await submitButton.evaluate((element) => element.click());
}

async function waitForFieldOnItemForm(page, fieldName) {
    await page
        .getByText(`${fieldName} EN`, { exact: true })
        .first()
        .waitFor({ state: 'visible', timeout: 15000 });
}

async function fillTranslatedInput(page, idPrefix, locale, value) {
    await page.locator(`#${idPrefix}_${locale}`).fill(value);
}

async function fillOptionRows(page, rows) {
    const valueInputs = page.locator('input[placeholder="Value"]');
    const labelInputs = page.locator('input[placeholder="Label"]');
    const count = await valueInputs.count();

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (index >= count) {
            await page.getByRole('button', { name: 'Add choice' }).click();
        }
        await valueInputs.nth(index).fill(row.value);
        await labelInputs.nth(index).fill(row.label);
    }
}

async function fillTreeOptionRoot(page, value, label) {
    const rootValue = page.locator('input[placeholder="Value"]').first();
    const rootLabel = page.locator('input[placeholder="Label"]').first();
    await rootValue.fill(value);
    await rootLabel.fill(label);
}

async function configureFieldSettings(page, fieldType, context) {
    const { relatedCollectionName, relatedCollectionId } = context;

    if (OPTION_TYPES.has(fieldType)) {
        if (fieldType === 'checkbox_group_tree') {
            await fillTreeOptionRoot(page, 'child', 'Child option');
        } else {
            await fillOptionRows(page, [
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
            ]);
        }
    }

    if (fieldType === 'api_autocomplete') {
        await page.locator('#api_autocomplete_url').fill('https://jsonplaceholder.typicode.com/users');
    }

    if (fieldType === 'slider') {
        await page.locator('#slider_min').fill('0');
        await page.locator('#slider_max').fill('100');
        await page.locator('#slider_step').fill('5');
        await page.locator('#slider_default').fill('25');
    }

    if (RELATION_TYPES.has(fieldType)) {
        const relatedCollectionId =
            fieldType === 'relation_tree'
                ? context.treeCollectionId
                : context.relatedCollectionId;
        await page.locator('#related_collection_id').selectOption(String(relatedCollectionId));
        await page.locator('#display_field').fill('title');
    }

    if (fieldType === 'm2a') {
        const allowedCollectionNames = [
            relatedCollectionName,
            context.m2aSecondCollectionName,
        ].filter(Boolean);

        for (const collectionName of allowedCollectionNames) {
            const allowedCollectionLabel = page
                .locator('label')
                .filter({ hasText: collectionName })
                .first();
            await allowedCollectionLabel.locator('input[type="checkbox"]').check();
        }
    }
}

async function createFieldViaUi(page, collectionId, fieldType, fieldName, context) {
    await page.goto(`${baseUrl}/collections/${collectionId}/fields`);
    await openAddFieldDrawer(page);
    const label = FIELD_TYPE_LABELS[fieldType];
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.locator('#field_name_create').waitFor({ state: 'visible' });
    await page.locator('#field_name_create').fill(fieldName);
    await fillTranslatedInput(page, 'display_name_create', 'en', `${fieldName} EN`);
    await fillTranslatedInput(page, 'display_name_create', 'it', `${fieldName} IT`);
    await fillTranslatedInput(page, 'note_create', 'en', `Note for ${fieldName}`);
    await configureFieldSettings(page, fieldType, context);
    await page.locator('#translatable_create').uncheck();
    await submitFieldForm(page, 'create');
    await page.waitForSelector(`[data-field-name="${fieldName}"]`, { timeout: 20000 });
}

function apiFieldSettings(fieldType, fieldName, context) {
    const settings = {
        display_name: { en: `${fieldName} EN`, it: `${fieldName} IT` },
        note: { en: `Note for ${fieldName}` },
    };

    if (OPTION_TYPES.has(fieldType)) {
        if (fieldType === 'checkbox_group_tree') {
            settings.options = [{ value: 'child', label: 'Child option', children: [] }];
        } else {
            settings.options = [
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
            ];
        }
    }

    if (fieldType === 'api_autocomplete') {
        settings.url = 'https://jsonplaceholder.typicode.com/users';
    }

    if (fieldType === 'slider') {
        Object.assign(settings, { min: 0, max: 100, step: 5, default_value: 25 });
    }

    if (RELATION_TYPES.has(fieldType)) {
        settings.related_collection_id =
            fieldType === 'relation_tree'
                ? context.treeCollectionId
                : context.relatedCollectionId;
        settings.display_field = 'title';
    }

    if (fieldType === 'm2a') {
        settings.allowed_collection_ids = context.m2aCollectionIds;
    }

    return settings;
}

async function createField(page, collectionId, fieldType, fieldName, context) {
    if (UI_FIELD_TYPES.includes(fieldType)) {
        try {
            await createFieldViaUi(page, collectionId, fieldType, fieldName, context);
            return 'ui';
        } catch (uiError) {
            console.warn(`  ! ${fieldType}: UI field create failed, falling back to API (${uiError.message})`);
        }
    }

    await createFieldViaApi(
        page,
        collectionId,
        fieldType,
        fieldName,
        apiFieldSettings(fieldType, fieldName, context),
    );
    await page.goto(`${baseUrl}/collections/${collectionId}/fields`);
    await page.waitForSelector(`[data-field-name="${fieldName}"]`, { timeout: 15000 });

    return 'api';
}

async function createFieldViaApi(page, collectionId, fieldType, fieldName, settings = {}) {
    const formData = {
        name: fieldName,
        type: fieldType,
        translatable: '0',
    };

    const appendSettings = (prefix, value) => {
        if (value === null || value === undefined) {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((entry, index) => {
                if (typeof entry === 'object' && entry !== null) {
                    for (const [nestedKey, nestedValue] of Object.entries(entry)) {
                        if (nestedKey === 'children' && Array.isArray(nestedValue)) {
                            nestedValue.forEach((child, childIndex) => {
                                for (const [childKey, childValue] of Object.entries(child)) {
                                    formData[`${prefix}[${index}][children][${childIndex}][${childKey}]`] =
                                        String(childValue);
                                }
                            });
                            continue;
                        }

                        formData[`${prefix}[${index}][${nestedKey}]`] = String(nestedValue);
                    }
                    return;
                }

                formData[`${prefix}[${index}]`] = String(entry);
            });
            return;
        }

        if (typeof value === 'object') {
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                appendSettings(`${prefix}[${nestedKey}]`, nestedValue);
            }
            return;
        }

        formData[prefix] = String(value);
    };

    appendSettings('settings', settings);

    const response = await inertiaPost(page, `${baseUrl}/collections/${collectionId}/fields`, formData);

    if (response.status >= 400) {
        throw new Error(`API field create failed for ${fieldType}: HTTP ${response.status}`);
    }
}

async function openRelationCombobox(page, fieldLabel, index = 0) {
    const fieldBlock = page
        .locator('div')
        .filter({ has: page.getByText(fieldLabel, { exact: true }) })
        .first();
    await fieldBlock.getByRole('combobox').nth(index).evaluate((element) => element.click());
}

async function selectRelationOption(page, fieldLabel, optionLabel, comboboxIndex = 0) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            await openRelationCombobox(page, fieldLabel, comboboxIndex);
            await page.waitForTimeout(600);
            await page.getByRole('button', { name: optionLabel }).click({ timeout: 5000 });
            await page.keyboard.press('Escape');
            return;
        } catch (error) {
            if (attempt === 2) {
                throw error;
            }

            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        }
    }
}

async function setHiddenInputValue(page, inputName, value) {
    await page.waitForSelector(`input[name="${inputName}"]`, { state: 'attached', timeout: 15000 });
    await page.locator(`input[name="${inputName}"]`).evaluate((element, nextValue) => {
        element.value = String(nextValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

const API_ITEM_CREATE_TYPES = new Set(['image', 'files', 'file', 'm2a']);

function flattenFormEntries(data) {
    const entries = [];

    for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
            const arrayKey = key.endsWith('[]') ? key : `${key}[]`;
            value.forEach((entry) => {
                entries.push([arrayKey, String(entry)]);
            });
            continue;
        }

        entries.push([key, String(value)]);
    }

    return entries;
}

async function createItemViaApi(page, collectionId, data) {
    const response = await browserFormRequest(
        page,
        `${baseUrl}/collections/${collectionId}/items`,
        'POST',
        flattenFormEntries(data),
    );

    if (response.status >= 400) {
        throw new Error(`Item create failed: HTTP ${response.status}`);
    }

    const match = (response.location ?? '').match(/\/items\/(\d+)/);
    if (match) {
        return Number(match[1]);
    }

    const itemId = phpEval(
        `echo \\App\\Models\\CollectionItem::query()->where('collection_id', ${collectionId})->latest('id')->value('id') ?? '';`,
    ).trim();

    if (!itemId) {
        throw new Error('Item create failed: no item id in redirect or database');
    }

    return Number(itemId);
}

function buildItemPayload(fieldType, fieldName, context) {
    const payload = {};

    switch (fieldType) {
        case 'string':
        case 'textarea':
        case 'code':
            payload[`data[${fieldName}]`] = `value-${fieldName}`;
            break;
        case 'number':
            payload[`data[${fieldName}]`] = '42';
            break;
        case 'boolean':
            payload[`data[${fieldName}]`] = '1';
            break;
        case 'date':
            payload[`data[${fieldName}]`] = '2026-07-12T14:30:00';
            break;
        case 'color':
            payload[`data[${fieldName}]`] = '#ff5500';
            break;
        case 'select':
        case 'radio_group':
        case 'autocomplete':
        case 'api_autocomplete':
            payload[`data[${fieldName}]`] = 'a';
            break;
        case 'multiselect':
        case 'checkbox_group':
            payload[`data[${fieldName}]`] = ['a', 'b'];
            break;
        case 'checkbox_group_tree':
            payload[`data[${fieldName}]`] = ['child'];
            break;
        case 'tag':
            payload[`data[${fieldName}]`] = ['alpha', 'beta'];
            break;
        case 'map':
            payload[`data[${fieldName}][lat]`] = '45.4642';
            payload[`data[${fieldName}][lng]`] = '9.19';
            break;
        case 'slider':
            payload[`data[${fieldName}]`] = '50';
            break;
        case 'hash':
            payload[`data[${fieldName}]`] = '';
            break;
        case 'image':
        case 'file':
            payload[`data[${fieldName}]`] = String(context.fileIds?.[1] ?? context.fileIds?.[0] ?? '');
            break;
        case 'files':
            payload[`data[${fieldName}]`] = (context.fileIds ?? []).slice(0, 2);
            break;
        case 'many_to_one':
        case 'relation':
        case 'relation_tree':
            payload[`data[${fieldName}]`] = String(context.relatedItemIds?.[0] ?? '');
            break;
        case 'one_to_many':
        case 'many_to_many':
        case 'relation_many':
            payload[`data[${fieldName}]`] = (context.relatedItemIds ?? []).slice(0, 2);
            break;
        case 'm2a':
            payload[`data[${fieldName}][0][related_collection_id]`] = String(
                context.m2aCollectionIds?.[0] ?? '',
            );
            payload[`data[${fieldName}][0][related_item_id]`] = String(
                context.relatedItemIds?.[0] ?? '',
            );
            payload[`data[${fieldName}][1][related_collection_id]`] = String(
                context.m2aCollectionIds?.[1] ?? '',
            );
            payload[`data[${fieldName}][1][related_item_id]`] = String(
                context.extraItemId ?? context.relatedItemIds?.[1] ?? '',
            );
            break;
        default:
            payload[`data[${fieldName}]`] = `value-${fieldName}`;
    }

    return payload;
}

async function fillFieldValue(page, fieldType, fieldName, context) {
    const inputId = `data_${fieldName}`;
    const displayLabel = `${fieldName} EN`;

    switch (fieldType) {
        case 'string':
        case 'textarea':
        case 'code':
            await page.locator(`#${inputId}`).fill(`value-${fieldName}`);
            break;
        case 'number':
            await page.locator(`#${inputId}`).fill('42');
            break;
        case 'boolean':
            await page.locator(`#${inputId}`).click();
            break;
        case 'date':
            await page.locator(`#${inputId}`).fill('2026-07-12T14:30');
            break;
        case 'color':
            await page.locator(`#${inputId}`).fill('#ff5500');
            break;
        case 'select':
            await page.locator(`#${inputId}`).selectOption('a');
            break;
        case 'radio_group':
            await page.locator(`input[type="radio"][name="data[${fieldName}]"][value="a"]`).check();
            break;
        case 'multiselect':
            await page.locator(`#${inputId}`).selectOption(['a', 'b']);
            break;
        case 'checkbox_group':
            await page
                .locator('label')
                .filter({ hasText: 'Option A' })
                .first()
                .click();
            break;
        case 'checkbox_group_tree':
            await page.locator('label').filter({ hasText: 'Child option' }).first().click();
            break;
        case 'autocomplete':
        case 'api_autocomplete':
            await page.locator(`#${inputId}`).fill('a');
            break;
        case 'tag':
            await page.getByPlaceholder('Add tag…').fill('alpha');
            await page.keyboard.press('Enter');
            await page.getByPlaceholder('Add tag…').fill('beta');
            await page.keyboard.press('Enter');
            break;
        case 'wysiwyg':
        case 'markdown':
            await page.locator(`#${inputId}`).fill(`**${fieldName}** content`);
            break;
        case 'map':
            await page.locator(`#${inputId}_lat`).fill('45.4642');
            await page.locator(`#${inputId}_lng`).fill('9.1900');
            break;
        case 'slider':
            await page.locator(`input[name="data[${fieldName}]"]`).evaluate((element) => {
                element.value = '50';
                element.dispatchEvent(new Event('input', { bubbles: true }));
            });
            break;
        case 'hash':
            break;
        case 'image':
        case 'file': {
            const fileId = context.fileIds?.[1] ?? context.fileIds?.[0];
            if (!fileId) {
                throw new Error('No seeded file id available for image/file field');
            }
            await page.locator(`input[name="data[${fieldName}]"]`).fill(String(fileId));
            break;
        }
        case 'files': {
            const fileIds = context.fileIds ?? [];
            if (fileIds.length === 0) {
                throw new Error('No seeded file ids available for files field');
            }
            await page.evaluate(
                ({ fieldName, selectedFileIds }) => {
                    const form = document.getElementById('collection-item-form');
                    if (!form) {
                        return;
                    }

                    form.querySelectorAll(`input[name="data[${fieldName}][]"]`).forEach((input) => input.remove());
                    for (const selectedFileId of selectedFileIds) {
                        const hiddenInput = document.createElement('input');
                        hiddenInput.type = 'hidden';
                        hiddenInput.name = `data[${fieldName}][]`;
                        hiddenInput.value = String(selectedFileId);
                        form.appendChild(hiddenInput);
                    }
                },
                { fieldName, selectedFileIds: fileIds.slice(0, 2) },
            );
            break;
        }
        case 'many_to_one':
        case 'relation':
            await selectRelationOption(page, displayLabel, context.relatedItemLabels[0]);
            break;
        case 'relation_tree':
            await selectRelationOption(page, displayLabel, 'Tree Parent');
            break;
        case 'one_to_many':
        case 'many_to_many':
        case 'relation_many':
            for (const label of context.relatedItemLabels) {
                await selectRelationOption(page, displayLabel, label);
            }
            break;
        case 'm2a':
            await page.getByRole('button', { name: 'Add block' }).first().click();
            await page.getByRole('combobox').first().evaluate((element) => element.click());
            await page.waitForTimeout(600);
            await page.getByRole('button', { name: context.relatedItemLabels[0] }).click();
            await page.keyboard.press('Escape');
            await page.getByRole('button', { name: 'Add block' }).first().click();
            if (context.m2aSecondCollectionName) {
                await page.locator('select').last().selectOption({ label: context.m2aSecondCollectionName });
            }
            await page.getByRole('combobox').last().evaluate((element) => element.click());
            await page.waitForTimeout(600);
            await page.getByRole('button', { name: 'Extra Block' }).click();
            await page.keyboard.press('Escape');
            break;
        default:
            await page.locator(`#${inputId}`).fill(`value-${fieldName}`);
    }
}

async function verifyFieldValue(page, fieldType, fieldName, context, phase = 'edit') {
    const inputId = `data_${fieldName}`;

    switch (fieldType) {
        case 'string':
        case 'textarea':
        case 'code':
            await page.locator(`#${inputId}`).waitFor({ state: 'visible' });
            if (phase === 'edit') {
                const value = await page.locator(`#${inputId}`).inputValue();
                if (!value.includes(`value-${fieldName}`)) {
                    throw new Error(`Expected saved value for ${fieldName}, got "${value}"`);
                }
            }
            break;
        case 'hash': {
            const hashInput = page.locator(`#${inputId}`);
            const hashValue = await hashInput.inputValue();
            if (hashValue.length < 32) {
                throw new Error(`Hash field ${fieldName} not auto-generated`);
            }
            break;
        }
        case 'boolean': {
            const checked = await page.locator(`#${inputId}`).getAttribute('aria-checked');
            if (phase === 'edit' && checked !== 'true') {
                throw new Error(`Boolean ${fieldName} expected true on edit`);
            }
            break;
        }
        case 'many_to_one':
        case 'relation':
        case 'one_to_many':
        case 'many_to_many':
        case 'relation_many':
        case 'relation_tree':
        case 'm2a':
            await waitForFieldOnItemForm(page, fieldName);
            await page.getByRole('combobox').first().waitFor({ state: 'visible', timeout: 10000 });
            break;
        case 'image':
        case 'files':
        case 'file': {
            await waitForFieldOnItemForm(page, fieldName);
            const fileIdPattern = context.fileIds?.length
                ? new RegExp(`File #(${context.fileIds.join('|')})|\\.txt|\\.png`, 'i')
                : /File #|\.txt|\.png/i;
            await page.getByText(fileIdPattern).first().waitFor({ state: 'visible', timeout: 10000 });
            break;
        }
        case 'slider':
        case 'tag':
        case 'map':
        case 'checkbox_group':
        case 'checkbox_group_tree':
        case 'radio_group':
            await waitForFieldOnItemForm(page, fieldName);
            break;
        default:
            if (await page.locator(`#${inputId}`).count()) {
                await page.locator(`#${inputId}`).waitFor({ state: 'visible' });
            } else {
                await waitForFieldOnItemForm(page, fieldName);
            }
    }
}

async function updateFieldValue(page, fieldType, fieldName) {
    const inputId = `data_${fieldName}`;

    if (['string', 'textarea', 'code'].includes(fieldType)) {
        await page.locator(`#${inputId}`).fill(`updated-${fieldName}`);
    } else if (fieldType === 'number') {
        await page.locator(`#${inputId}`).fill('99');
    } else if (fieldType === 'boolean') {
        await page.locator(`#${inputId}`).click();
    }
}

async function testFieldType(page, fieldType, fieldName, context, errors) {
    const collectionSlug = `e2e-${fieldType}-${timestamp}`;
    let collectionId = null;

    try {
        collectionId = await createCollectionViaApi(
            page,
            `E2E ${fieldType} ${timestamp}`,
            collectionSlug,
        );

        const createMode = await createField(page, collectionId, fieldType, fieldName, context);

        await page.goto(`${baseUrl}/collections/${collectionId}/items/new`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await waitForFieldOnItemForm(page, fieldName);
        await page.getByText(`Note for ${fieldName}`).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        let itemId;
        let itemCreateMode = 'ui';

        if (API_ITEM_CREATE_TYPES.has(fieldType)) {
            itemId = await createItemViaApi(
                page,
                collectionId,
                buildItemPayload(fieldType, fieldName, context),
            );
            itemCreateMode = 'api';
            await page.goto(`${baseUrl}/collections/${collectionId}/items/${itemId}`);
            await page.waitForLoadState('networkidle').catch(() => {});
            await waitForFieldOnItemForm(page, fieldName);
        } else {
            await fillFieldValue(page, fieldType, fieldName, context);
            await page.getByRole('button', { name: 'Create' }).click({ force: true });
            await page.waitForURL(/\/items\/\d+$/, { timeout: 15000 });
            const itemMatch = page.url().match(/\/items\/(\d+)/);
            itemId = Number(itemMatch?.[1]);
        }

        await verifyFieldValue(page, fieldType, fieldName, context, 'edit');
        await updateFieldValue(page, fieldType, fieldName);
        await page.getByRole('button', { name: 'Save' }).click({ force: true });
        await page.waitForURL(/\/items\/\d+$/, { timeout: 15000 });

        await page.getByRole('button', { name: 'Delete' }).click({ force: true });
        await page.waitForURL(new RegExp(`/collections/${collectionId}/items`), { timeout: 15000 });

        await inertiaDelete(page, `${baseUrl}/collections/${collectionId}`);

        markResult(
            fieldType,
            true,
            undefined,
            {
                ...(createMode === 'api' && UI_FIELD_TYPES.includes(fieldType)
                    ? { note: 'field created via API fallback' }
                    : {}),
                ...(itemCreateMode === 'api' ? { itemNote: 'item created via API' } : {}),
            },
        );
        console.log(`  ✓ ${fieldType}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ fieldType, message });
        markResult(fieldType, false, message);
        console.error(`  ✗ ${fieldType}: ${message}`);
        mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({
            path: path.join(screenshotDir, `${fieldType}-failure.png`),
            fullPage: true,
        }).catch(() => {});

        if (collectionId) {
            await inertiaDelete(page, `${baseUrl}/collections/${collectionId}`).catch(() => {});
        }
    }
}

function seedTestData() {
    const relatedSlug = `e2e-related-${timestamp}`;
    const treeSlug = `e2e-tree-${timestamp}`;
    const mainSlug = `e2e-fields-${timestamp}`;
    const extraSlug = `e2e-m2a-extra-${timestamp}`;

    const script = `
$related = \\App\\Models\\Collection::query()->create(['name' => 'E2E Related ${timestamp}', 'slug' => '${relatedSlug}']);
\\App\\Models\\CollectionField::query()->create(['collection_id' => $related->id, 'name' => 'title', 'type' => \\App\\Enums\\FieldTypeEnum::String, 'translatable' => false, 'sort_order' => 0]);
$item1 = \\App\\Models\\CollectionItem::query()->create(['collection_id' => $related->id]);
$item2 = \\App\\Models\\CollectionItem::query()->create(['collection_id' => $related->id]);
$writer = app(\\App\\Services\\Collections\\CollectionItemValuesWriter::class);
$assembler = app(\\App\\Services\\Collections\\CollectionItemDataNormalizer::class);
$writer->sync($item1, $related, $assembler->normalize($related, ['title' => 'Related One']));
$writer->sync($item2, $related, $assembler->normalize($related, ['title' => 'Related Two']));

$extra = \\App\\Models\\Collection::query()->create(['name' => 'E2E M2A Extra ${timestamp}', 'slug' => '${extraSlug}']);
\\App\\Models\\CollectionField::query()->create(['collection_id' => $extra->id, 'name' => 'title', 'type' => \\App\\Enums\\FieldTypeEnum::String, 'translatable' => false, 'sort_order' => 0]);
$extraItem = \\App\\Models\\CollectionItem::query()->create(['collection_id' => $extra->id]);
$writer->sync($extraItem, $extra, $assembler->normalize($extra, ['title' => 'Extra Block']));

$tree = \\App\\Models\\Collection::query()->create(['name' => 'E2E Tree ${timestamp}', 'slug' => '${treeSlug}']);
\\App\\Models\\CollectionField::query()->create(['collection_id' => $tree->id, 'name' => 'title', 'type' => \\App\\Enums\\FieldTypeEnum::String, 'translatable' => false, 'sort_order' => 0]);
$parent = \\App\\Models\\CollectionItem::query()->create(['collection_id' => $tree->id]);
$child = \\App\\Models\\CollectionItem::query()->create(['collection_id' => $tree->id]);
$writer->sync($parent, $tree, $assembler->normalize($tree, ['title' => 'Tree Parent']));
$writer->sync($child, $tree, $assembler->normalize($tree, ['title' => 'Tree Child']));

$file1 = \\App\\Models\\File::query()->create(['type' => \\App\\Enums\\FileTypeEnum::File, 'name' => 'e2e-one.txt', 'path' => '/e2e-one.txt', 'disk' => 'assets', 'storage_path' => '2026/e2e-one.txt', 'mime_type' => 'text/plain']);
$file2 = \\App\\Models\\File::query()->create(['type' => \\App\\Enums\\FileTypeEnum::File, 'name' => 'e2e-image.png', 'path' => '/e2e-image.png', 'disk' => 'assets', 'storage_path' => '2026/e2e-image.png', 'mime_type' => 'image/png']);

echo json_encode([
    'relatedCollectionId' => $related->id,
    'relatedCollectionName' => $related->name,
    'relatedItemIds' => [$item1->id, $item2->id],
    'extraItemId' => $extraItem->id,
    'treeCollectionId' => $tree->id,
    'extraCollectionId' => $extra->id,
    'extraCollectionName' => $extra->name,
    'mainSlug' => '${mainSlug}',
    'fileIds' => [$file1->id, $file2->id],
]);
`;

    const output = phpEval(script);
    const jsonLine = output.split('\n').find((line) => line.startsWith('{'));
    if (!jsonLine) {
        throw new Error(`Failed to seed test data: ${output}`);
    }

    return JSON.parse(jsonLine);
}

function verifyCollectionDeleted(collectionId) {
    const output = phpEval(`
$collectionCount = \\App\\Models\\Collection::query()->where('id', ${collectionId})->count();
$itemCount = \\App\\Models\\CollectionItem::query()->where('collection_id', ${collectionId})->count();
$valueCount = \\App\\Models\\CollectionItemValue::query()->whereIn('item_id', \\App\\Models\\CollectionItem::query()->where('collection_id', ${collectionId})->pluck('id'))->count();
$fieldCount = \\App\\Models\\CollectionField::query()->where('collection_id', ${collectionId})->count();
echo json_encode(['collection' => $collectionCount, 'items' => $itemCount, 'values' => $valueCount, 'fields' => $fieldCount]);
`);
    const jsonLine = output.split('\n').find((line) => line.startsWith('{'));
    return JSON.parse(jsonLine);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 960 });
page.setDefaultTimeout(15000);

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const testErrors = [];

try {
    console.log('Seeding test data via artisan…');
    const seed = seedTestData();

    console.log('Logging in…');
    await login(page);

    const context = {
        relatedCollectionId: seed.relatedCollectionId,
        relatedCollectionName: seed.relatedCollectionName,
        relatedItemLabels: ['Related One', 'Related Two'],
        treeCollectionId: seed.treeCollectionId,
        m2aCollectionIds: [seed.relatedCollectionId, seed.extraCollectionId],
        m2aSecondCollectionName: seed.extraCollectionName,
        relatedItemIds: seed.relatedItemIds,
        extraItemId: seed.extraItemId,
        fileIds: seed.fileIds,
    };

    console.log('\n--- Per field type CRUD ---');
    const allFieldTypes = process.env.FIELD_TYPE_FILTER
        ? process.env.FIELD_TYPE_FILTER.split(',').map((entry) => entry.trim())
        : [...UI_FIELD_TYPES, ...API_ONLY_FIELD_TYPES];

    for (const fieldType of allFieldTypes) {
        const fieldName = `fld_${fieldType.replace(/[^a-z0-9_]/g, '_')}`;
        await testFieldType(page, fieldType, fieldName, context, testErrors);
    }

    console.log('\n--- Collection deletion cleanup ---');
    const deleteCollectionId = await createCollectionViaApi(
        page,
        `E2E Delete ${timestamp}`,
        `e2e-delete-${timestamp}`,
    );

    await createFieldViaApi(page, deleteCollectionId, 'string', 'title', {});
    await inertiaPost(page, `${baseUrl}/collections/${deleteCollectionId}/items`, {
        'data[title]': 'delete me',
    });

    const deleteResponse = await inertiaDelete(
        page,
        `${baseUrl}/collections/${deleteCollectionId}`,
    );
    if (deleteResponse.status >= 400) {
        throw new Error(`Collection delete failed: HTTP ${deleteResponse.status}`);
    }

    const orphanCounts = verifyCollectionDeleted(deleteCollectionId);
    if (orphanCounts.collection !== 0 || orphanCounts.items !== 0 || orphanCounts.fields !== 0) {
        throw new Error(`Orphan records after delete: ${JSON.stringify(orphanCounts)}`);
    }
    console.log('  ✓ collection deletion cleans up linked data');
    markResult('collection_deletion', true);

    if (pageErrors.length > 0) {
        console.warn(`JavaScript errors (non-fatal): ${pageErrors.join('; ')}`);
    }

    const failed = Object.entries(results).filter(([, result]) => !result.pass);
    console.log('\n=== SUMMARY ===');
    for (const [fieldType, result] of Object.entries(results)) {
        const status = result.pass ? 'PASS' : result.skipped ? 'SKIP' : 'FAIL';
        console.log(`${status}  ${fieldType}${result.error ? `: ${result.error}` : ''}${result.note ? ` (${result.note})` : ''}`);
    }

    writeFileSync(
        path.join('scripts', `e2e-results-${timestamp}.json`),
        JSON.stringify({ timestamp, results, pageErrors }, null, 2),
    );

    if (failed.length > 0) {
        process.exitCode = 1;
    } else {
        console.log('\nAll field type E2E tests passed.');
    }
} catch (error) {
    console.error('\nFATAL:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    await browser.close();
}
