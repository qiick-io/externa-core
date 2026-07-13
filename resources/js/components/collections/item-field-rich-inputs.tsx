import { useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
    parseCodeFieldSettings,
    parseColorFieldSettings,
    parseTagFieldSettings,
    parseTextareaFieldSettings,
    resolveTranslatedText,
} from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderMarkdownPreview(source: string): string {
    let html = escapeHtml(source);

    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary underline">$1</a>',
    );
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
    html = html.replace(/\n/g, '<br />');

    return html;
}

function wrapSelection(textarea: HTMLTextAreaElement, prefix: string, suffix = prefix) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const next =
        textarea.value.slice(0, start) +
        prefix +
        selected +
        suffix +
        textarea.value.slice(end);

    textarea.value = next;
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function WysiwygFieldInput({
    id,
    name,
    settings,
    locales,
    defaultValue,
    readonly,
    placeholder,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    locales: string[];
    defaultValue: string;
    readonly: boolean;
    placeholder: string;
}) {
    const textareaSettings = parseTextareaFieldSettings(settings);
    const [value, setValue] = useState(defaultValue);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    return (
        <div className="space-y-2">
            {!readonly ? (
                <div className="flex flex-wrap gap-1">
                    {(
                        [
                            ['B', '**'],
                            ['I', '*'],
                            ['Link', '[text](url)'],
                        ] as const
                    ).map(([label, snippet]) => (
                        <Button
                            key={label}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                                const textarea = textareaRef.current;
                                if (!textarea) {
                                    return;
                                }

                                if (snippet === '[text](url)') {
                                    wrapSelection(textarea, '[', '](url)');
                                } else {
                                    wrapSelection(textarea, snippet);
                                }

                                setValue(textarea.value);
                            }}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            ) : null}
            <textarea
                ref={textareaRef}
                id={id}
                name={name}
                className={cn(inputLike, 'min-h-[160px] py-2 font-mono text-sm')}
                rows={textareaSettings.rows}
                value={value}
                readOnly={readonly}
                maxLength={textareaSettings.maxLength ?? undefined}
                placeholder={resolveTranslatedText(
                    textareaSettings.placeholder,
                    locales,
                    placeholder,
                )}
                onChange={(event) => setValue(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
                HTML is stored as-is. Toolbar inserts lightweight markers; use raw
                HTML tags when needed.
            </p>
        </div>
    );
}

export function MarkdownFieldInput({
    id,
    name,
    settings,
    locales,
    defaultValue,
    readonly,
    placeholder,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    locales: string[];
    defaultValue: string;
    readonly: boolean;
    placeholder: string;
}) {
    const textareaSettings = parseTextareaFieldSettings(settings);
    const [value, setValue] = useState(defaultValue);
    const [tab, setTab] = useState<'edit' | 'preview'>('edit');
    const previewHtml = useMemo(() => renderMarkdownPreview(value), [value]);

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={tab === 'edit' ? 'default' : 'outline'}
                    onClick={() => setTab('edit')}
                >
                    Edit
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={tab === 'preview' ? 'default' : 'outline'}
                    onClick={() => setTab('preview')}
                >
                    Preview
                </Button>
            </div>
            {tab === 'edit' ? (
                <textarea
                    id={id}
                    name={name}
                    className={cn(inputLike, 'min-h-[160px] py-2 font-mono text-sm')}
                    rows={textareaSettings.rows}
                    value={value}
                    readOnly={readonly}
                    maxLength={textareaSettings.maxLength ?? undefined}
                    placeholder={resolveTranslatedText(
                        textareaSettings.placeholder,
                        locales,
                        placeholder,
                    )}
                    onChange={(event) => setValue(event.target.value)}
                />
            ) : (
                <>
                    <input type="hidden" name={name} value={value} />
                    <div
                        className="prose prose-sm dark:prose-invert min-h-[160px] rounded-md border p-3"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                </>
            )}
        </div>
    );
}

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
    const [value, setValue] = useState(
        defaultValue || codeSettings.template || '',
    );
    const lines = value.split('\n');

    return (
        <div
            className={cn(
                'grid overflow-hidden rounded-md border',
                codeSettings.lineNumbers ? 'grid-cols-[auto_1fr]' : 'grid-cols-1',
            )}
        >
            {codeSettings.lineNumbers ? (
                <pre
                    aria-hidden
                    className="bg-muted/40 text-muted-foreground select-none border-r px-3 py-2 text-right font-mono text-xs leading-6"
                >
                    {lines.map((_, index) => (
                        <div key={index}>{index + 1}</div>
                    ))}
                </pre>
            ) : null}
            <textarea
                id={id}
                name={name}
                className={cn(
                    'min-h-[160px] resize-y bg-background px-3 py-2 font-mono text-sm leading-6 focus-visible:outline-none',
                    codeSettings.lineWrapping ? 'whitespace-pre-wrap' : 'whitespace-pre',
                )}
                value={value}
                readOnly={readonly}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
            />
        </div>
    );
}

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
    const tagSettings = parseTagFieldSettings(settings);
    const [tags, setTags] = useState<string[]>(defaultParts);
    const [draft, setDraft] = useState('');

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
            <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border px-2 py-1">
                {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        {!readonly ? (
                            <button
                                type="button"
                                className="text-xs"
                                onClick={() =>
                                    setTags((current) =>
                                        current.filter((entry) => entry !== tag),
                                    )
                                }
                            >
                                ×
                            </button>
                        ) : null}
                    </Badge>
                ))}
                {!readonly ? (
                    <Input
                        value={draft}
                        className="h-7 min-w-[120px] flex-1 border-0 shadow-none focus-visible:ring-0"
                        placeholder="Add tag…"
                        list={
                            tagSettings.presets.length > 0
                                ? `${nameBase}-presets`
                                : undefined
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
                ) : null}
            </div>
            {tagSettings.presets.length > 0 ? (
                <datalist id={`${nameBase}-presets`}>
                    {tagSettings.presets.map((preset) => (
                        <option key={preset} value={preset} />
                    ))}
                </datalist>
            ) : null}
            {tags.map((tag) => (
                <input key={tag} type="hidden" name={`${nameBase}[]`} value={tag} />
            ))}
        </div>
    );
}

function hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    const chunk =
        normalized.length === 3
            ? normalized
                  .split('')
                  .map((part) => part + part)
                  .join('')
            : normalized.padEnd(6, '0').slice(0, 6);

    const red = Number.parseInt(chunk.slice(0, 2), 16);
    const green = Number.parseInt(chunk.slice(2, 4), 16);
    const blue = Number.parseInt(chunk.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

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

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    id={id}
                    type="color"
                    value={hex}
                    disabled={readonly}
                    className="h-10 w-14 p-1"
                    onChange={(event) => setHex(event.target.value)}
                />
                <Input
                    type="text"
                    value={storedValue}
                    readOnly
                    className="max-w-[140px] font-mono text-sm"
                />
                <span
                    className="size-8 rounded border"
                    style={{
                        backgroundColor: colorSettings.opacity
                            ? hexToRgba(hex, alpha)
                            : hex,
                    }}
                />
            </div>
            {colorSettings.opacity ? (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                        Opacity {Math.round(alpha * 100)}%
                    </p>
                    <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[Math.round(alpha * 100)]}
                        disabled={readonly}
                        onValueChange={(next) =>
                            setAlpha((next[0] ?? 100) / 100)
                        }
                    />
                </div>
            ) : null}
            <input type="hidden" name={name} value={storedValue} />
        </div>
    );
}
