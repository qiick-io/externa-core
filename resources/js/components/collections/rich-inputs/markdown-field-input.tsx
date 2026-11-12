import { usePage } from '@inertiajs/react';
import MDEditor, {
    TextAreaCommandOrchestrator,
    TextAreaTextApi,
} from '@uiw/react-md-editor';
import type { ICommand } from '@uiw/react-md-editor';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { FileUrlImportDialog } from '@/components/admin/file-url-import-dialog';
import { AssistantMarkdown } from '@/components/ai/assistant-markdown';
import {
    MarkdownModeToggle,
    MarkdownToolbar,
} from '@/components/collections/rich-inputs/markdown-toolbar';
import { useMarkdownShortcuts } from '@/components/collections/rich-inputs/use-markdown-shortcuts';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAppearance } from '@/hooks/use-appearance';
import {
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

/**
 * Keep @uiw/react-md-editor for React markdown editing; match common CMS *actions* +
 * Externa WYSIWYG chrome. Fixed viewport with internal scroll.
 */
const MARKDOWN_EDITOR_HEIGHT = 560;

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
        ...Array.from({ length: safeRows }, () => `| ${cells.join(' | ')} |`),
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
    notImageMessage: string,
    maxBytes?: number | null,
): Promise<AdminFileRow> {
    if (!file.type.startsWith('image/')) {
        throw new Error(notImageMessage);
    }

    if (file.size > CHUNK_SIZE_BYTES) {
        return uploadFileChunked(file, null, undefined, maxBytes);
    }

    return uploadFileDirect(file, null, maxBytes);
}

/**
 * Markdown editor for collection item fields.
 * Feature set covers the default rich-text markdown toolbar actions.
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
    const { t } = useTranslation();
    const textareaSettings = parseTextareaFieldSettings(settings);
    const { resolvedAppearance } = useAppearance();
    const { projectSettings } = usePage().props;
    const filesMaxUploadBytes = projectSettings?.filesMaxUploadBytes ?? null;
    const [value, setValue] = useState(defaultValue);
    const [internalMode, setInternalMode] = useState<'edit' | 'preview'>(
        'edit',
    );
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

    const insertImagesFromFiles = useCallback(
        (files: AdminFileRow[]) => {
            const snippets: string[] = [];

            for (const file of files) {
                const url = filePublicUrl(file);

                if (!url) {
                    toast.error(
                        `"${file.title || file.name}" has no public URL.`,
                    );

                    continue;
                }

                snippets.push(
                    markdownImageSnippet(
                        url,
                        file.title || file.name || 'image',
                    ),
                );
            }

            if (snippets.length === 0) {
                return;
            }

            insertSnippet(snippets.join(''));
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
            if (
                !fileList ||
                fileList.length === 0 ||
                readonly ||
                imageUploading
            ) {
                return;
            }

            setImageUploading(true);

            try {
                const uploaded: AdminFileRow[] = [];

                for (const file of Array.from(fileList)) {
                    uploaded.push(
                        await uploadImageFile(
                            file,
                            t('richText.imageOnly'),
                            filesMaxUploadBytes,
                        ),
                    );
                }

                insertImagesFromFiles(uploaded);
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('richText.imageUploadFailed'),
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
            insertImagesFromFiles,
            readonly,
            t,
        ],
    );

    useMarkdownShortcuts(rootRef, readonly, tab, runCommand);

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
                multiple
                className="hidden"
                disabled={readonly || imageUploading}
                onChange={(event) => void handleLocalImage(event.target.files)}
            />
            <FilePickerDrawer
                open={imageLibraryOpen}
                onOpenChange={setImageLibraryOpen}
                acceptImagesOnly
                multiple
                title={t('richText.chooseImages')}
                onSelect={(files) => {
                    insertImagesFromFiles(files);
                }}
            />
            <FileUrlImportDialog
                open={imageUrlOpen}
                onOpenChange={setImageUrlOpen}
                acceptImagesOnly
                onImported={(file) => {
                    insertImagesFromFiles([file]);
                }}
            />
            <Dialog open={tableOpen} onOpenChange={setTableOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t('richText.insertTable')}</DialogTitle>
                        <DialogDescription>
                            {t('richText.insertTableDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-table-rows`}>
                                {t('richText.tableRows')}
                            </Label>
                            <Input
                                id={`${id}-table-rows`}
                                type="number"
                                min={1}
                                max={20}
                                value={tableRows}
                                onChange={(event) =>
                                    setTableRows(
                                        Number(event.target.value) || 1,
                                    )
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-table-cols`}>
                                {t('richText.tableColumns')}
                            </Label>
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
                            {t('common.cancel')}
                        </Button>
                        <Button type="button" onClick={insertTable}>
                            {t('richText.createTable')}
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
                            {t('richText.nothingToPreview')}
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
                            <Spinner className="size-3.5" />
                            {t('richText.uploadingImage')}
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
