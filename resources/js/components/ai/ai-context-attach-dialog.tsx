import {
    Check,
    File as FileIcon,
    FolderOpen,
    Library,
    Pencil,
    Plus,
    Search,
    Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { Button } from '@/components/ui/button';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type {
    AiContextCollectionOption,
    AiContextFileOption,
    AiContextItemOption,
    AiPendingContextAttachment,
    AiSavedPrompt,
} from '@/lib/ai-context';
import {
    createAiSavedPrompt,
    deleteAiSavedPrompt,
    fetchAiContextCollections,
    fetchAiContextFiles,
    fetchAiContextItems,
    fetchAiSavedPrompts,
    updateAiSavedPrompt,
} from '@/lib/ai-context';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type AiContextAttachDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAttach: (entries: AiPendingContextAttachment[]) => void;
    onPickUploadFiles?: () => void;
};

/** The check that marks a picked row, as in the shadcn combobox. */
function SelectedCheck({ isSelected }: { isSelected: boolean }) {
    return (
        <Check
            aria-hidden
            className={cn(
                'mt-0.5 ml-auto',
                isSelected ? 'opacity-100' : 'opacity-0',
            )}
        />
    );
}

type PromptDraft = {
    id?: number;
    name: string;
    description: string;
    body: string;
};

/**
 * Attach picker for collection items, library files, and saved project prompts.
 */
export function AiContextAttachDialog({
    open,
    onOpenChange,
    onAttach,
    onPickUploadFiles,
}: AiContextAttachDialogProps) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('items');
    const [search, setSearch] = useState('');
    const [collections, setCollections] = useState<AiContextCollectionOption[]>(
        [],
    );
    const [collectionId, setCollectionId] = useState<number | null>(null);
    const [items, setItems] = useState<AiContextItemOption[]>([]);
    const [files, setFiles] = useState<AiContextFileOption[]>([]);
    const [prompts, setPrompts] = useState<AiSavedPrompt[]>([]);
    const [canManagePrompts, setCanManagePrompts] = useState(false);
    const [selected, setSelected] = useState<AiPendingContextAttachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [promptDraft, setPromptDraft] = useState<PromptDraft | null>(null);
    /** Shown under the prompt form when Save is pressed with an empty name or body. */
    const [isPromptIncomplete, setIsPromptIncomplete] = useState(false);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [promptPendingDelete, setPromptPendingDelete] =
        useState<AiSavedPrompt | null>(null);
    const [isDeletingPrompt, setIsDeletingPrompt] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setSearch('');
        setSelected([]);
        setPromptDraft(null);
        setTab('items');
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);

            try {
                if (tab === 'items') {
                    const nextCollections = await fetchAiContextCollections();

                    if (cancelled) {
                        return;
                    }

                    setCollections(nextCollections);
                    const nextCollectionId =
                        collectionId ?? nextCollections[0]?.id ?? null;
                    setCollectionId(nextCollectionId);

                    const nextItems = await fetchAiContextItems({
                        collectionId: nextCollectionId,
                        search,
                    });

                    if (!cancelled) {
                        setItems(nextItems);
                    }
                } else if (tab === 'files') {
                    const nextFiles = await fetchAiContextFiles(search);

                    if (!cancelled) {
                        setFiles(nextFiles);
                    }
                } else {
                    const result = await fetchAiSavedPrompts(search);

                    if (!cancelled) {
                        setPrompts(result.prompts);
                        setCanManagePrompts(result.canManage);
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : t('ai.context.loadFailed'),
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        const timer = window.setTimeout(() => {
            void load();
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, tab, search, collectionId, t]);

    const toggleSelected = (entry: AiPendingContextAttachment) => {
        setSelected((current) => {
            const exists = current.some(
                (row) => row.kind === entry.kind && row.id === entry.id,
            );

            if (exists) {
                return current.filter(
                    (row) => !(row.kind === entry.kind && row.id === entry.id),
                );
            }

            return [...current, entry];
        });
    };

    const isSelected = (kind: AiPendingContextAttachment['kind'], id: number) =>
        selected.some((row) => row.kind === kind && row.id === id);

    const handleConfirm = () => {
        if (selected.length === 0) {
            onOpenChange(false);

            return;
        }

        onAttach(selected);
        onOpenChange(false);
    };

    const handleSavePrompt = async () => {
        if (
            !promptDraft ||
            promptDraft.name.trim() === '' ||
            promptDraft.body.trim() === ''
        ) {
            setIsPromptIncomplete(true);

            return;
        }

        setSavingPrompt(true);

        try {
            if (promptDraft.id != null) {
                await updateAiSavedPrompt(promptDraft.id, {
                    name: promptDraft.name.trim(),
                    description: promptDraft.description.trim() || null,
                    body: promptDraft.body,
                });
            } else {
                await createAiSavedPrompt({
                    name: promptDraft.name.trim(),
                    description: promptDraft.description.trim() || undefined,
                    body: promptDraft.body,
                });
            }

            const result = await fetchAiSavedPrompts(search);
            setPrompts(result.prompts);
            setCanManagePrompts(result.canManage);
            setPromptDraft(null);
            toast.success(t('ai.context.promptSaved'));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('ai.context.promptSaveFailed'),
            );
        } finally {
            setSavingPrompt(false);
        }
    };

    const handleDeletePrompt = async (prompt: AiSavedPrompt) => {
        setIsDeletingPrompt(true);

        try {
            await deleteAiSavedPrompt(prompt.id);
            setPrompts((current) =>
                current.filter((row) => row.id !== prompt.id),
            );
            setSelected((current) =>
                current.filter(
                    (row) => !(row.kind === 'prompt' && row.id === prompt.id),
                ),
            );
            toast.success(t('ai.context.promptDeleted'));
            setPromptPendingDelete(null);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('ai.context.promptDeleteFailed'),
            );
        } finally {
            setIsDeletingPrompt(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('ai.context.title')}</DialogTitle>
                    <DialogDescription>
                        {t('ai.context.description')}
                    </DialogDescription>
                </DialogHeader>

                {/* One cmdk root: arrows and Enter in the search move through and pick the list of the open tab. */}
                <Command
                    shouldFilter={false}
                    className="h-auto min-h-0 overflow-visible bg-transparent"
                >
                    <Tabs
                        value={tab}
                        onValueChange={setTab}
                        className="min-h-0"
                    >
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="items">
                                {t('ai.context.tabs.items')}
                            </TabsTrigger>
                            <TabsTrigger value="files">
                                {t('ai.context.tabs.files')}
                            </TabsTrigger>
                            <TabsTrigger value="prompts">
                                {t('ai.context.tabs.prompts')}
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-1 flex flex-wrap gap-2">
                            <InputGroup className="min-w-[12rem] flex-1">
                                <InputGroupAddon>
                                    <Search />
                                </InputGroupAddon>
                                <InputGroupInput
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder={t(
                                        'ai.context.searchPlaceholder',
                                    )}
                                    aria-label={t('ai.context.searchAria')}
                                />
                            </InputGroup>
                            {tab === 'items' ? (
                                <NativeSelect
                                    value={collectionId ?? ''}
                                    // Keep arrow keys in the select, away from the cmdk list.
                                    onKeyDown={(event) =>
                                        event.stopPropagation()
                                    }
                                    onChange={(event) =>
                                        setCollectionId(
                                            event.target.value
                                                ? Number(event.target.value)
                                                : null,
                                        )
                                    }
                                    aria-label={t('ai.context.collectionAria')}
                                >
                                    {collections.map((collection) => (
                                        <option
                                            key={collection.id}
                                            value={collection.id}
                                        >
                                            {collection.name}
                                        </option>
                                    ))}
                                </NativeSelect>
                            ) : null}
                            {tab === 'files' && onPickUploadFiles ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={onPickUploadFiles}
                                >
                                    {t('ai.context.uploadImport')}
                                </Button>
                            ) : null}
                            {tab === 'prompts' && canManagePrompts ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setPromptDraft({
                                            name: '',
                                            description: '',
                                            body: '',
                                        })
                                    }
                                >
                                    <Plus className="size-4" />
                                    {t('ai.context.newPrompt')}
                                </Button>
                            ) : null}
                        </div>

                        <TabsContent
                            value="items"
                            className="mt-1 max-h-[40vh] overflow-y-auto"
                        >
                            {loading ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('ai.context.loading')}
                                </p>
                            ) : items.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('ai.context.emptyItems')}
                                </p>
                            ) : (
                                <CommandList
                                    label={t('ai.context.tabs.items')}
                                    className="max-h-none"
                                >
                                    {items.map((item) => (
                                        <CommandItem
                                            key={item.id}
                                            value={`item-${item.id}`}
                                            className="items-start"
                                            onSelect={() =>
                                                toggleSelected({
                                                    kind: 'item',
                                                    id: item.id,
                                                    name: item.label,
                                                    collection_id:
                                                        item.collection_id,
                                                    collection_name:
                                                        item.collection_name,
                                                })
                                            }
                                        >
                                            <Library className="mt-0.5" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium">
                                                    {item.label}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {item.collection_name} · #
                                                    {item.id}
                                                </span>
                                            </span>
                                            <SelectedCheck
                                                isSelected={isSelected(
                                                    'item',
                                                    item.id,
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandList>
                            )}
                        </TabsContent>

                        <TabsContent
                            value="files"
                            className="mt-1 max-h-[40vh] overflow-y-auto"
                        >
                            {loading ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('ai.context.loading')}
                                </p>
                            ) : files.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('ai.context.emptyFiles')}
                                </p>
                            ) : (
                                <CommandList
                                    label={t('ai.context.tabs.files')}
                                    className="max-h-none"
                                >
                                    {files.map((file) => (
                                        <CommandItem
                                            key={file.id}
                                            value={`file-${file.id}`}
                                            className="items-start"
                                            onSelect={() =>
                                                toggleSelected({
                                                    kind: 'file',
                                                    id: file.id,
                                                    name: file.name,
                                                    mime: file.mime,
                                                    size: file.size,
                                                })
                                            }
                                        >
                                            {file.type === 'folder' ? (
                                                <FolderOpen className="mt-0.5" />
                                            ) : (
                                                <FileIcon className="mt-0.5" />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium">
                                                    {file.name}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    #{file.id}
                                                    {file.mime
                                                        ? ` · ${file.mime}`
                                                        : ''}
                                                </span>
                                            </span>
                                            <SelectedCheck
                                                isSelected={isSelected(
                                                    'file',
                                                    file.id,
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandList>
                            )}
                        </TabsContent>

                        <TabsContent
                            value="prompts"
                            className="mt-1 max-h-[40vh] overflow-y-auto"
                        >
                            {promptDraft ? (
                                <div
                                    role="presentation"
                                    className="space-y-3 rounded-md border p-3"
                                    // Enter and arrows belong to the form fields, not the cmdk list.
                                    onKeyDown={(event) =>
                                        event.stopPropagation()
                                    }
                                >
                                    <div className="space-y-1.5">
                                        <Label htmlFor="ai-prompt-name">
                                            {t('ai.context.promptName')}
                                        </Label>
                                        <Input
                                            id="ai-prompt-name"
                                            value={promptDraft.name}
                                            aria-invalid={
                                                isPromptIncomplete &&
                                                promptDraft.name.trim() === ''
                                            }
                                            aria-describedby={
                                                isPromptIncomplete
                                                    ? 'ai-prompt-error'
                                                    : undefined
                                            }
                                            onChange={(event) => {
                                                setPromptDraft({
                                                    ...promptDraft,
                                                    name: event.target.value,
                                                });
                                                setIsPromptIncomplete(false);
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="ai-prompt-description">
                                            {t('ai.context.promptDescription')}
                                        </Label>
                                        <Input
                                            id="ai-prompt-description"
                                            value={promptDraft.description}
                                            onChange={(event) =>
                                                setPromptDraft({
                                                    ...promptDraft,
                                                    description:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="ai-prompt-body">
                                            {t('ai.context.promptBody')}
                                        </Label>
                                        <Textarea
                                            id="ai-prompt-body"
                                            rows={5}
                                            value={promptDraft.body}
                                            aria-invalid={
                                                isPromptIncomplete &&
                                                promptDraft.body.trim() === ''
                                            }
                                            aria-describedby={
                                                isPromptIncomplete
                                                    ? 'ai-prompt-error'
                                                    : undefined
                                            }
                                            onChange={(event) => {
                                                setPromptDraft({
                                                    ...promptDraft,
                                                    body: event.target.value,
                                                });
                                                setIsPromptIncomplete(false);
                                            }}
                                        />
                                    </div>
                                    {isPromptIncomplete ? (
                                        <FieldError id="ai-prompt-error">
                                            {t('ai.context.promptRequired')}
                                        </FieldError>
                                    ) : null}
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => {
                                                setPromptDraft(null);
                                                setIsPromptIncomplete(false);
                                            }}
                                        >
                                            {t('ai.context.cancel')}
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={savingPrompt}
                                            onClick={() =>
                                                void handleSavePrompt()
                                            }
                                        >
                                            {t('ai.context.savePrompt')}
                                        </Button>
                                    </div>
                                </div>
                            ) : loading ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('ai.context.loading')}
                                </p>
                            ) : prompts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('ai.context.emptyPrompts')}
                                </p>
                            ) : (
                                <CommandList
                                    label={t('ai.context.tabs.prompts')}
                                    className="max-h-none"
                                >
                                    {prompts.map((prompt) => (
                                        <div
                                            key={prompt.id}
                                            className="flex items-start gap-1"
                                        >
                                            <CommandItem
                                                value={`prompt-${prompt.id}`}
                                                className="min-w-0 flex-1 items-start"
                                                onSelect={() =>
                                                    toggleSelected({
                                                        kind: 'prompt',
                                                        id: prompt.id,
                                                        name: prompt.name,
                                                    })
                                                }
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-medium">
                                                        {prompt.name}
                                                    </span>
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {prompt.description ||
                                                            prompt.body}
                                                    </span>
                                                </span>
                                                <SelectedCheck
                                                    isSelected={isSelected(
                                                        'prompt',
                                                        prompt.id,
                                                    )}
                                                />
                                            </CommandItem>
                                            {canManagePrompts ? (
                                                <div className="flex shrink-0 gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label={t(
                                                            'ai.context.editPrompt',
                                                        )}
                                                        onClick={() =>
                                                            setPromptDraft({
                                                                id: prompt.id,
                                                                name: prompt.name,
                                                                description:
                                                                    prompt.description ??
                                                                    '',
                                                                body: prompt.body,
                                                            })
                                                        }
                                                    >
                                                        <Pencil className="size-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label={t(
                                                            'ai.context.deletePrompt',
                                                        )}
                                                        onClick={() =>
                                                            setPromptPendingDelete(
                                                                prompt,
                                                            )
                                                        }
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </CommandList>
                            )}
                        </TabsContent>
                    </Tabs>
                </Command>

                <DialogFooter className="gap-2 sm:gap-0">
                    <p className="mr-auto text-xs text-muted-foreground">
                        {t('ai.context.selectedCount', {
                            count: selected.length,
                        })}
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                    >
                        {t('ai.context.cancel')}
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                        {t('ai.context.attachSelected')}
                    </Button>
                </DialogFooter>

                <ConfirmDestructiveDialog
                    open={promptPendingDelete !== null}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) {
                            setPromptPendingDelete(null);
                        }
                    }}
                    title={t('confirmDestructive.deletePromptTitle', {
                        name: promptPendingDelete?.name ?? '',
                    })}
                    description={t(
                        'confirmDestructive.deletePromptDescription',
                    )}
                    confirming={isDeletingPrompt}
                    onConfirm={() => {
                        if (promptPendingDelete !== null) {
                            void handleDeletePrompt(promptPendingDelete);
                        }
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
