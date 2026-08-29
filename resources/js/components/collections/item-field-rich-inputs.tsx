import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import MDEditor, {
    commands,
    TextAreaCommandOrchestrator,
    TextAreaTextApi,
} from '@uiw/react-md-editor';
import type { ICommand } from '@uiw/react-md-editor';
import { usePage } from '@inertiajs/react';
import {
    Bold,
    ChevronDown,
    Code2,
    Eye,
    FileText,
    FolderOpen,
    Heading,
    Heading2,
    Heading3,
    ImageIcon,
    Italic,
    Link2,
    List,
    ListOrdered,
    Loader2,
    Quote,
    Redo2,
    Strikethrough,
    Table2,
    Undo2,
    Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { FileUrlImportDialog } from '@/components/admin/file-url-import-dialog';
import { AssistantMarkdown } from '@/components/ai/assistant-markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAppearance } from '@/hooks/use-appearance';
import {
    parseCodeFieldSettings,
    parseColorFieldSettings,
    parseTagFieldSettings,
    parseTextareaFieldSettings,
    resolveTranslatedText,
} from '@/lib/collection-field-types';
import {
    CHUNK_SIZE_BYTES,
    filePublicUrl,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { AdminFileRow } from '@/types/files';

import '@uiw/react-md-editor/markdown-editor.css';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

/** Outer chrome for color picker — matches choice-field bordered groups. */
const colorFieldChrome =
    'w-full rounded-md border border-input bg-transparent px-3 py-1.5 shadow-xs dark:border-white/25 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-inset';

/**
 * Directus markdown interface uses CodeMirror 5 + custom Vue toolbar — not this
 * package. We keep @uiw/react-md-editor for React, match Directus *actions* +
 * Externa WYSIWYG chrome. Fixed viewport with internal scroll.
 */
const MARKDOWN_EDITOR_HEIGHT = 560;

const markdownHeadingCommands: ICommand[] = [
    commands.title1,
    commands.title2,
    commands.title3,
    commands.title4,
    commands.title5,
    commands.title6,
];

function buildMarkdownTable(rows: number, columns: number): string {
    const safeRows = Math.max(1, Math.min(20, Math.floor(rows)));
    const safeCols = Math.max(1, Math.min(12, Math.floor(columns)));
    const headers = Array.from({ length: safeCols }, () => 'Header');
    const cells = Array.from({ length: safeCols }, () => 'Cell');
    const separators = Array.from({ length: safeCols }, () => '------');

    return [
        '',
        `| ${headers.join(' | ')} |`,
        `| ${separators.join(' | ')} |`,
        ...Array.from(
            { length: safeRows },
            () => `| ${cells.join(' | ')} |`,
        ),
        '',
        '',
    ].join('\n');
}

function markdownImageSnippet(url: string, alt = 'image'): string {
    const safeAlt = alt.replace(/[[\]]/g, '') || 'image';

    return `![${safeAlt}](${url})\n`;
}

async function uploadImageFile(
    file: File,
    maxBytes?: number | null,
): Promise<AdminFileRow> {
    if (!file.type.startsWith('image/')) {
        throw new Error('Please choose an image file.');
    }

    if (file.size > CHUNK_SIZE_BYTES) {
        return uploadFileChunked(file, null, undefined, maxBytes);
    }

    return uploadFileDirect(file, null, maxBytes);
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
        <div>
            <input type="hidden" name={name} value={value} />
            <div className="overflow-hidden rounded-md border border-input bg-background shadow-xs">
                {editor ? <WysiwygToolbar editor={editor} /> : null}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

/**
 * Edit / preview toggle for markdown fields (place on the field title row).
 */
export function MarkdownModeToggle({
    value,
    onChange,
    disabled = false,
}: {
    value: 'edit' | 'preview';
    onChange: (next: 'edit' | 'preview') => void;
    disabled?: boolean;
}) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => {
                if (next === 'edit' || next === 'preview') {
                    onChange(next);
                }
            }}
            size="sm"
            className="justify-start"
            disabled={disabled}
        >
            <ToggleGroupItem value="edit" aria-label="Edit" className="px-2">
                <FileText className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
                value="preview"
                aria-label="Preview"
                className="px-2"
            >
                <Eye className="size-3.5" />
            </ToggleGroupItem>
        </ToggleGroup>
    );
}

/**
 * Directus-parity markdown actions with WYSIWYG-matching chrome.
 * Directus stack is Vue+CodeMirror; we drive @uiw textarea via orchestrator.
 */
function MarkdownToolbar({
    disabled,
    onRun,
    onOpenTable,
    onImageFromComputer,
    onImageFromLibrary,
    onImageFromUrl,
}: {
    disabled: boolean;
    onRun: (command: ICommand) => void;
    onOpenTable: () => void;
    onImageFromComputer: () => void;
    onImageFromLibrary: () => void;
    onImageFromUrl: () => void;
}) {
    return (
        <div className="flex flex-wrap gap-1 border-b p-1.5">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 px-2"
                        aria-label="Heading"
                        title="Heading"
                        disabled={disabled}
                    >
                        <Heading className="size-3.5" />
                        <ChevronDown className="size-3.5 opacity-70" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[11rem]">
                    {markdownHeadingCommands.map((command, index) => {
                        const level = index + 1;

                        return (
                            <DropdownMenuItem
                                key={command.name ?? level}
                                className="min-h-10 py-2.5"
                                onSelect={() => onRun(command)}
                            >
                                Heading {level}
                                <DropdownMenuShortcut>
                                    ⌘⌥{level}
                                </DropdownMenuShortcut>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
            <ToolbarButton
                label="Bold"
                disabled={disabled}
                onClick={() => onRun(commands.bold)}
            >
                <Bold className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Italic"
                disabled={disabled}
                onClick={() => onRun(commands.italic)}
            >
                <Italic className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Strikethrough"
                disabled={disabled}
                onClick={() => onRun(commands.strikethrough)}
            >
                <Strikethrough className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Bullet list"
                disabled={disabled}
                onClick={() => onRun(commands.unorderedListCommand)}
            >
                <List className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Ordered list"
                disabled={disabled}
                onClick={() => onRun(commands.orderedListCommand)}
            >
                <ListOrdered className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Blockquote"
                disabled={disabled}
                onClick={() => onRun(commands.quote)}
            >
                <Quote className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Code"
                disabled={disabled}
                onClick={() => onRun(commands.code)}
            >
                <Code2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Link"
                disabled={disabled}
                onClick={() => onRun(commands.link)}
            >
                <Link2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label="Table"
                disabled={disabled}
                onClick={onOpenTable}
            >
                <Table2 className="size-3.5" />
            </ToolbarButton>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        aria-label="Image"
                        title="Image"
                        disabled={disabled}
                    >
                        <ImageIcon className="size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[14rem]">
                    <DropdownMenuItem
                        className="min-h-10 gap-2 py-2.5"
                        onSelect={onImageFromComputer}
                    >
                        <Upload className="size-4" />
                        Upload from computer
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="min-h-10 gap-2 py-2.5"
                        onSelect={onImageFromLibrary}
                    >
                        <FolderOpen className="size-4" />
                        Choose from library
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="min-h-10 gap-2 py-2.5"
                        onSelect={onImageFromUrl}
                    >
                        <Link2 className="size-4" />
                        Import from URL
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

/**
 * Markdown editor for collection item fields.
 * Feature set matches Directus `input-rich-text-md` default toolbar.
 */
export function MarkdownFieldInput({
    id,
    name,
    settings,
    locales,
    defaultValue,
    readonly,
    placeholder,
    mode: modeProp,
    onModeChange,
    showModeToggle = true,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    locales: string[];
    defaultValue: string;
    readonly: boolean;
    placeholder: string;
    mode?: 'edit' | 'preview';
    onModeChange?: (next: 'edit' | 'preview') => void;
    /** When false, parent should render MarkdownModeToggle on the title row. */
    showModeToggle?: boolean;
}) {
    const textareaSettings = parseTextareaFieldSettings(settings);
    const { resolvedAppearance } = useAppearance();
    const { projectSettings } = usePage().props;
    const filesMaxUploadBytes = projectSettings?.filesMaxUploadBytes ?? null;
    const [value, setValue] = useState(defaultValue);
    const [internalMode, setInternalMode] = useState<'edit' | 'preview'>('edit');
    const [tableOpen, setTableOpen] = useState(false);
    const [tableRows, setTableRows] = useState(4);
    const [tableColumns, setTableColumns] = useState(4);
    const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
    const [imageUrlOpen, setImageUrlOpen] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const tab = modeProp ?? internalMode;
    const setTab = onModeChange ?? setInternalMode;

    // @uiw overwrites textareaProps.ref — resolve by id after mount.
    const getTextarea = useCallback((): HTMLTextAreaElement | null => {
        return document.getElementById(
            `${id}-textarea`,
        ) as HTMLTextAreaElement | null;
    }, [id]);

    const syncFromTextarea = useCallback(() => {
        const textarea = getTextarea();

        if (!textarea || readonly) {
            return;
        }

        setValue(textarea.value);
    }, [getTextarea, readonly]);

    const insertSnippet = useCallback(
        (snippet: string) => {
            const textarea = getTextarea();

            if (!textarea || readonly) {
                return;
            }

            textarea.focus();
            new TextAreaTextApi(textarea).replaceSelection(snippet);
            syncFromTextarea();
        },
        [getTextarea, readonly, syncFromTextarea],
    );

    const insertImageFromFile = useCallback(
        (file: AdminFileRow) => {
            const url = filePublicUrl(file);

            if (!url) {
                toast.error('Selected file has no public URL.');

                return;
            }

            insertSnippet(
                markdownImageSnippet(url, file.title || file.filename || 'image'),
            );
        },
        [insertSnippet],
    );

    const runCommand = useCallback(
        (command: ICommand) => {
            const textarea = getTextarea();

            if (!textarea || readonly) {
                return;
            }

            textarea.focus();
            new TextAreaCommandOrchestrator(textarea).executeCommand(command);
            syncFromTextarea();
        },
        [getTextarea, readonly, syncFromTextarea],
    );

    const insertTable = useCallback(() => {
        insertSnippet(buildMarkdownTable(tableRows, tableColumns));
        setTableOpen(false);
    }, [insertSnippet, tableColumns, tableRows]);

    const handleLocalImage = useCallback(
        async (fileList: FileList | null): Promise<void> => {
            const file = fileList?.[0];

            if (!file || readonly || imageUploading) {
                return;
            }

            setImageUploading(true);

            try {
                const row = await uploadImageFile(file, filesMaxUploadBytes);
                insertImageFromFile(row);
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'Image upload failed.',
                );
            } finally {
                setImageUploading(false);

                if (imageInputRef.current) {
                    imageInputRef.current.value = '';
                }
            }
        },
        [
            filesMaxUploadBytes,
            imageUploading,
            insertImageFromFile,
            readonly,
        ],
    );

    useEffect(() => {
        const root = rootRef.current;

        if (!root || readonly || tab !== 'edit') {
            return;
        }

        const onKeyDown = (event: KeyboardEvent): void => {
            const meta = event.metaKey || event.ctrlKey;

            if (!meta) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === 'b' && !event.altKey) {
                event.preventDefault();
                runCommand(commands.bold);

                return;
            }

            if (key === 'i' && !event.altKey) {
                event.preventDefault();
                runCommand(commands.italic);

                return;
            }

            if (key === 'k' && !event.altKey) {
                event.preventDefault();
                runCommand(commands.link);

                return;
            }

            if (!event.altKey) {
                return;
            }

            if (key === 'd') {
                event.preventDefault();
                runCommand(commands.strikethrough);

                return;
            }

            if (key === 'q') {
                event.preventDefault();
                runCommand(commands.quote);

                return;
            }

            if (key === 'c') {
                event.preventDefault();
                runCommand(commands.code);

                return;
            }

            const headingLevel = Number(key);

            if (headingLevel >= 1 && headingLevel <= 6) {
                event.preventDefault();
                runCommand(markdownHeadingCommands[headingLevel - 1]!);
            }
        };

        root.addEventListener('keydown', onKeyDown);

        return () => root.removeEventListener('keydown', onKeyDown);
    }, [readonly, runCommand, tab]);

    return (
        <div className="space-y-2" ref={rootRef}>
            {showModeToggle ? (
                <MarkdownModeToggle
                    value={tab}
                    onChange={setTab}
                    disabled={readonly}
                />
            ) : null}
            <input type="hidden" name={name} value={value} />
            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={readonly || imageUploading}
                onChange={(event) => void handleLocalImage(event.target.files)}
            />
            <FilePickerDrawer
                open={imageLibraryOpen}
                onOpenChange={setImageLibraryOpen}
                acceptImagesOnly
                title="Choose image"
                onSelect={(file) => {
                    insertImageFromFile(file);
                    setImageLibraryOpen(false);
                }}
            />
            <FileUrlImportDialog
                open={imageUrlOpen}
                onOpenChange={setImageUrlOpen}
                acceptImagesOnly
                onImported={(file) => {
                    insertImageFromFile(file);
                }}
            />
            <Dialog open={tableOpen} onOpenChange={setTableOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Insert table</DialogTitle>
                        <DialogDescription>
                            Choose rows and columns for the markdown table.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-table-rows`}>Rows</Label>
                            <Input
                                id={`${id}-table-rows`}
                                type="number"
                                min={1}
                                max={20}
                                value={tableRows}
                                onChange={(event) =>
                                    setTableRows(Number(event.target.value) || 1)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-table-cols`}>Columns</Label>
                            <Input
                                id={`${id}-table-cols`}
                                type="number"
                                min={1}
                                max={12}
                                value={tableColumns}
                                onChange={(event) =>
                                    setTableColumns(
                                        Number(event.target.value) || 1,
                                    )
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setTableOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="button" onClick={insertTable}>
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {tab === 'preview' ? (
                <div
                    id={id}
                    className="h-[560px] overflow-y-auto rounded-md border border-input bg-background p-3 shadow-xs"
                >
                    {value.trim() === '' ? (
                        <p className="text-sm text-muted-foreground">
                            Nothing to preview.
                        </p>
                    ) : (
                        <AssistantMarkdown content={value} />
                    )}
                </div>
            ) : (
                <div
                    id={id}
                    data-color-mode={resolvedAppearance}
                    className={cn(
                        'overflow-hidden rounded-md border border-input bg-background shadow-xs',
                        // Package defaults leave .w-md-editor-text ~100px when highlight is off.
                        '[&_.w-md-editor]:border-0! [&_.w-md-editor]:bg-background! [&_.w-md-editor]:shadow-none!',
                        '[&_.w-md-editor-content]:h-full!',
                        '[&_.w-md-editor-text]:relative! [&_.w-md-editor-text]:h-full! [&_.w-md-editor-text]:min-h-full!',
                        '[&_.w-md-editor-text-input]:h-full! [&_.w-md-editor-text-input]:min-h-full!',
                        '[&_.w-md-editor-text-input]:overflow-auto! [&_.w-md-editor-text-input]:bg-transparent!',
                        '[&_.w-md-editor-text-pre]:bg-transparent!',
                    )}
                >
                    {!readonly ? (
                        <MarkdownToolbar
                            disabled={readonly || imageUploading}
                            onRun={runCommand}
                            onOpenTable={() => setTableOpen(true)}
                            onImageFromComputer={() => {
                                // Radix closes menu before click; defer so OS file dialog opens.
                                window.setTimeout(() => {
                                    imageInputRef.current?.click();
                                }, 0);
                            }}
                            onImageFromLibrary={() => setImageLibraryOpen(true)}
                            onImageFromUrl={() => setImageUrlOpen(true)}
                        />
                    ) : null}
                    {imageUploading ? (
                        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Uploading image…
                        </div>
                    ) : null}
                    <MDEditor
                        value={value}
                        preview="edit"
                        hideToolbar
                        highlightEnable={false}
                        visibleDragbar={false}
                        height={MARKDOWN_EDITOR_HEIGHT}
                        textareaProps={{
                            id: `${id}-textarea`,
                            readOnly: readonly,
                            maxLength: textareaSettings.maxLength ?? undefined,
                            placeholder: resolveTranslatedText(
                                textareaSettings.placeholder,
                                locales,
                                placeholder,
                            ),
                            style: {
                                height: '100%',
                                minHeight: '100%',
                                overflow: 'auto',
                            },
                        }}
                        commands={[]}
                        extraCommands={[]}
                        onChange={(next) => {
                            if (readonly) {
                                return;
                            }

                            setValue(next ?? '');
                        }}
                    />
                </div>
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
        <div className={cn(colorFieldChrome, 'space-y-2')}>
            <div className="flex h-7 items-center gap-2">
                <Input
                    id={id}
                    type="color"
                    value={hex}
                    disabled={readonly}
                    className="h-7 w-7 shrink-0 cursor-pointer border-0 p-0 shadow-none focus-visible:ring-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0"
                    onChange={(event) => setHex(event.target.value)}
                />
                <Input
                    type="text"
                    value={storedValue}
                    readOnly
                    className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
                />
            </div>
            {colorSettings.opacity ? (
                <div className="space-y-1.5">
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
