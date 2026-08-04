import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    Bold,
    Eye,
    FileText,
    Heading2,
    Heading3,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    Redo2,
    Strikethrough,
    Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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

function ToolbarButton({
    label,
    active,
    disabled,
    onClick,
    children,
}: {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            className="h-7 px-2"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

function WysiwygToolbar({ editor }: { editor: Editor }) {
    const setLink = (): void => {
        const previous = editor.getAttributes('link').href as
            string | undefined;
        const url = window.prompt('Link URL', previous ?? 'https://');

        if (url === null) {
            return;
        }

        const trimmed = url.trim();

        if (trimmed === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();

            return;
        }

        editor
            .chain()
            .focus()
            .extendMarkRange('link')
            .setLink({ href: trimmed })
            .run();
    };

    return (
        <div className="flex flex-wrap gap-1 border-b p-1.5">
            <ToolbarButton
                label="Bold"
                active={editor.isActive('bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
            >
                <Bold className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Italic"
                active={editor.isActive('italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
            >
                <Italic className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Strikethrough"
                active={editor.isActive('strike')}
                onClick={() => editor.chain().focus().toggleStrike().run()}
            >
                <Strikethrough className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Heading 2"
                active={editor.isActive('heading', { level: 2 })}
                onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
            >
                <Heading2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Heading 3"
                active={editor.isActive('heading', { level: 3 })}
                onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
            >
                <Heading3 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Bullet list"
                active={editor.isActive('bulletList')}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
                <List className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Ordered list"
                active={editor.isActive('orderedList')}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
                <ListOrdered className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Blockquote"
                active={editor.isActive('blockquote')}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
                <Quote className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Link"
                active={editor.isActive('link')}
                onClick={setLink}
            >
                <Link2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Undo"
                disabled={!editor.can().undo()}
                onClick={() => editor.chain().focus().undo().run()}
            >
                <Undo2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Redo"
                disabled={!editor.can().redo()}
                onClick={() => editor.chain().focus().redo().run()}
            >
                <Redo2 className="size-3.5" />
            </ToolbarButton>
        </div>
    );
}

/**
 * TipTap WYSIWYG editor for collection item fields (stores HTML).
 */
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
    const [value, setValue] = useState(defaultValue);
    const resolvedPlaceholder = resolveTranslatedText(
        parseTextareaFieldSettings(settings).placeholder,
        locales,
        placeholder,
    );

    const editor = useEditor({
        immediatelyRender: false,
        editable: !readonly,
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    rel: 'noopener noreferrer',
                    target: '_blank',
                },
            }),
            Placeholder.configure({
                placeholder: resolvedPlaceholder,
            }),
        ],
        content: defaultValue || '',
        editorProps: {
            attributes: {
                id,
                class: 'externa-tiptap-editor prose prose-sm dark:prose-invert max-w-none min-h-[160px] px-3 py-2 focus:outline-none',
            },
        },
        onUpdate: ({ editor: current }) => {
            const html = current.isEmpty ? '' : current.getHTML();
            setValue(html);
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        editor.setEditable(!readonly);
    }, [editor, readonly]);

    if (readonly) {
        return (
            <div className="space-y-2">
                <input type="hidden" name={name} value={value} />
                <div
                    className="prose prose-sm dark:prose-invert min-h-[120px] rounded-md border p-3"
                    dangerouslySetInnerHTML={{
                        __html:
                            value || '<p class="text-muted-foreground">—</p>',
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <input type="hidden" name={name} value={value} />
            <div className="overflow-hidden rounded-md border border-input bg-background shadow-xs">
                {editor ? <WysiwygToolbar editor={editor} /> : null}
                <EditorContent editor={editor} />
            </div>
            <p className="text-xs text-muted-foreground">
                TipTap editor — paste from Word/HTML is sanitized on save
                (scripts and unsafe tags stripped).
            </p>
        </div>
    );
}

/**
 * Markdown editor input for collection item fields.
 * @returns {JSX.Element}
 */
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
            <ToggleGroup
                type="single"
                value={tab}
                onValueChange={(value) => {
                    if (value === 'edit' || value === 'preview') {
                        setTab(value);
                    }
                }}
                size="sm"
                className="justify-start"
            >
                <ToggleGroupItem
                    value="edit"
                    aria-label="Edit"
                    className="px-2.5"
                >
                    <FileText className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="preview"
                    aria-label="Preview"
                    className="px-2.5"
                >
                    <Eye className="size-4" />
                </ToggleGroupItem>
            </ToggleGroup>
            {tab === 'edit' ? (
                <textarea
                    id={id}
                    name={name}
                    className={cn(
                        inputLike,
                        'min-h-[160px] py-2 font-mono text-sm',
                    )}
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

/**
 * Code editor input for collection item fields.
 * @returns {JSX.Element}
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
    const [value, setValue] = useState(
        defaultValue || codeSettings.template || '',
    );
    const lines = value.split('\n');

    return (
        <div
            className={cn(
                'grid overflow-hidden rounded-md border',
                codeSettings.lineNumbers
                    ? 'grid-cols-[auto_1fr]'
                    : 'grid-cols-1',
            )}
        >
            {codeSettings.lineNumbers ? (
                <pre
                    aria-hidden
                    className="border-r bg-muted/40 px-3 py-2 text-right font-mono text-xs leading-6 text-muted-foreground select-none"
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
                    codeSettings.lineWrapping
                        ? 'whitespace-pre-wrap'
                        : 'whitespace-pre',
                )}
                value={value}
                readOnly={readonly}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
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
                                        current.filter(
                                            (entry) => entry !== tag,
                                        ),
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
                    <p className="text-xs text-muted-foreground">
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
