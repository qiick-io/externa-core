import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown as codeMarkdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { bracketMatching } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AutocompleteInput } from '@/components/collections/autocomplete-input';
import { RemovableBadge } from '@/components/removable-badge';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useAppearance } from '@/hooks/use-appearance';
import {
    parseCodeFieldSettings,
    parseColorFieldSettings,
    parseTagFieldSettings,
} from '@/lib/collection-field-types';
import {
    fieldControlChromeMulti,
    fieldControlChromeSingle,
} from '@/lib/field-control-chrome';
import { cn } from '@/lib/utils';

// The rich-text editors live in ./rich-inputs; field inputs import them from here.
export { MarkdownFieldInput } from '@/components/collections/rich-inputs/markdown-field-input';
export { MarkdownModeToggle } from '@/components/collections/rich-inputs/markdown-toolbar';
export { WysiwygFieldInput } from '@/components/collections/rich-inputs/wysiwyg-field-input';

/** Outer chrome for color picker — matches the default Input height (`h-control`). */
const colorFieldChrome = cn(fieldControlChromeSingle, 'dark:border-white/25');
const colorFieldChromeWithOpacity = cn(
    fieldControlChromeMulti,
    'dark:border-white/25',
);

/**
 * Pretty-print valid JSON; leave invalid / empty text unchanged.
 */
function prettyPrintJson(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed === '') {
        return raw;
    }

    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
        return raw;
    }
}

/**
 * Map code field language setting → CodeMirror lang extension.
 */
function codeLanguageExtension(language: string): Extension {
    const normalized = language.trim().toLowerCase();

    switch (normalized) {
        case 'json':
            return json();
        case 'html':
            return html();
        case 'css':
            return css();
        case 'xml':
            return xml();
        case 'sql':
            return sql();
        case 'markdown':
        case 'md':
            return codeMarkdown();
        case 'typescript':
        case 'ts':
            return javascript({ typescript: true });
        case 'tsx':
            return javascript({ typescript: true, jsx: true });
        case 'jsx':
            return javascript({ jsx: true });
        case 'javascript':
        case 'js':
        default:
            return javascript();
    }
}

/**
 * Code editor input for collection item fields.
 * CodeMirror: syntax highlight, line numbers, JSON pretty-print.
 */
export function CodeFieldInput({
    id,
    name,
    settings,
    defaultValue,
    readonly,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    defaultValue: string;
    readonly: boolean;
}) {
    const codeSettings = parseCodeFieldSettings(settings);
    const { resolvedAppearance } = useAppearance();
    const isJson = codeSettings.language.trim().toLowerCase() === 'json';
    const [value, setValue] = useState(() => {
        const initial = defaultValue || codeSettings.template || '';

        return isJson ? prettyPrintJson(initial) : initial;
    });

    const extensions = useMemo((): Extension[] => {
        const next: Extension[] = [
            codeLanguageExtension(codeSettings.language),
            bracketMatching(),
        ];

        if (codeSettings.lineWrapping) {
            next.push(EditorView.lineWrapping);
        }

        if (readonly) {
            next.push(
                EditorView.editable.of(false),
                EditorView.theme({
                    '&': { cursor: 'default' },
                }),
            );
        }

        return next;
    }, [codeSettings.language, codeSettings.lineWrapping, readonly]);

    const formatJsonOnBlur = useCallback((): void => {
        if (!isJson || readonly) {
            return;
        }

        setValue((current) => prettyPrintJson(current));
    }, [isJson, readonly]);

    return (
        <div
            id={id}
            className="overflow-hidden rounded-md border border-input shadow-xs [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none"
        >
            <input type="hidden" name={name} value={value} />
            <CodeMirror
                value={value}
                height="200px"
                theme={resolvedAppearance === 'dark' ? vscodeDark : vscodeLight}
                editable={!readonly}
                basicSetup={{
                    lineNumbers: codeSettings.lineNumbers,
                    foldGutter: true,
                    highlightActiveLine: !readonly,
                    highlightActiveLineGutter: !readonly,
                    bracketMatching: true,
                }}
                extensions={extensions}
                onChange={(next) => {
                    if (!readonly) {
                        setValue(next);
                    }
                }}
                onBlur={formatJsonOnBlur}
            />
        </div>
    );
}

/**
 * Tag chip input for collection item fields.
 * @returns {JSX.Element}
 */
export function TagChipInput({
    nameBase,
    settings,
    defaultParts,
    readonly,
}: {
    nameBase: string;
    settings?: Record<string, unknown> | null;
    defaultParts: string[];
    readonly: boolean;
}) {
    const { t } = useTranslation();
    const tagSettings = parseTagFieldSettings(settings);
    const [tags, setTags] = useState<string[]>(defaultParts);
    const [draft, setDraft] = useState('');
    const chipBoxRef = useRef<HTMLDivElement>(null);

    const addTag = (raw: string) => {
        const trimmed = raw.trim();

        if (!trimmed) {
            return;
        }

        if (!tagSettings.allowOther && !tagSettings.presets.includes(trimmed)) {
            return;
        }

        setTags((current) =>
            current.includes(trimmed) ? current : [...current, trimmed],
        );
        setDraft('');
    };

    return (
        <div className="space-y-2">
            <div
                ref={chipBoxRef}
                className="flex min-h-control flex-wrap items-center gap-2 rounded-md border px-2 py-0.5"
            >
                {tags.map((tag) => (
                    <RemovableBadge
                        key={tag}
                        removeLabel={t('richText.removeTag', { name: tag })}
                        onRemove={
                            readonly
                                ? undefined
                                : () =>
                                      setTags((current) =>
                                          current.filter(
                                              (entry) => entry !== tag,
                                          ),
                                      )
                        }
                    >
                        {tag}
                    </RemovableBadge>
                ))}
                {!readonly ? (
                    <div className="min-w-[120px] flex-1">
                        <AutocompleteInput
                            anchorRef={chipBoxRef}
                            value={draft}
                            className="h-7 border-0 shadow-none focus-visible:ring-0"
                            placeholder={t('richText.addTag')}
                            suggestions={tagSettings.presets
                                .filter(
                                    (preset) =>
                                        !tags.includes(preset) &&
                                        preset
                                            .toLowerCase()
                                            .includes(
                                                draft.trim().toLowerCase(),
                                            ),
                                )
                                .map((preset) => ({
                                    value: preset,
                                    label: preset,
                                }))}
                            onSelectSuggestion={(suggestion) =>
                                addTag(suggestion.value)
                            }
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addTag(draft);
                                }
                            }}
                            onBlur={() => addTag(draft)}
                        />
                    </div>
                ) : null}
            </div>
            {tags.map((tag) => (
                <input
                    key={tag}
                    type="hidden"
                    name={`${nameBase}[]`}
                    value={tag}
                />
            ))}
        </div>
    );
}

/**
 * Color picker input for collection item fields.
 * @returns {JSX.Element}
 */
export function ColorFieldInput({
    id,
    name,
    settings,
    defaultValue,
    readonly,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    defaultValue: string;
    readonly: boolean;
}) {
    const colorSettings = parseColorFieldSettings(settings);
    const initialHex = defaultValue.startsWith('#')
        ? defaultValue.slice(0, 7)
        : '#000000';
    const initialAlpha =
        defaultValue.length === 9
            ? Number.parseInt(defaultValue.slice(7, 9), 16) / 255
            : 1;

    const [hex, setHex] = useState(initialHex);
    const [alpha, setAlpha] = useState(initialAlpha);

    const storedValue = colorSettings.opacity
        ? `${hex}${Math.round(alpha * 255)
              .toString(16)
              .padStart(2, '0')}`
        : hex;

    const swatchAndHex = (
        <>
            <Input
                id={id}
                type="color"
                value={hex}
                disabled={readonly}
                className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 disabled:cursor-default disabled:opacity-100 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                onChange={(event) => setHex(event.target.value)}
            />
            <Input
                type="text"
                value={storedValue}
                readOnly
                className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-sm shadow-none read-only:bg-transparent focus-visible:ring-0"
            />
        </>
    );

    if (!colorSettings.opacity) {
        return (
            <div
                className={cn(
                    colorFieldChrome,
                    'gap-2',
                    readonly && 'bg-muted/50',
                )}
            >
                {swatchAndHex}
                <input type="hidden" name={name} value={storedValue} />
            </div>
        );
    }

    return (
        <div
            className={cn(
                colorFieldChromeWithOpacity,
                'space-y-2',
                readonly && 'bg-muted/50',
            )}
        >
            <div className="flex h-7 items-center gap-2">{swatchAndHex}</div>
            <div className="flex items-center gap-2">
                <Badge
                    variant="muted"
                    className="min-w-9 font-mono text-foreground tabular-nums"
                >
                    {Math.round(alpha * 100)}%
                </Badge>
                <Slider
                    className="w-auto min-w-0 flex-1"
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(alpha * 100)]}
                    disabled={readonly}
                    onValueChange={(next) => setAlpha((next[0] ?? 100) / 100)}
                />
            </div>
            <input type="hidden" name={name} value={storedValue} />
        </div>
    );
}
