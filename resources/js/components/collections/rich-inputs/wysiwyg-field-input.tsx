import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    Bold,
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ToolbarButton,
    ToolbarToggle,
} from '@/components/collections/rich-inputs/rich-text-toolbar-controls';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Toggle } from '@/components/ui/toggle';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    parseTextareaFieldSettings,
    resolveTranslatedText,
} from '@/lib/collection-field-types';

/**
 * Link editor for the WYSIWYG toolbar (was `window.prompt`): Popover with a
 * URL Input. Apply (or Enter) sets the link on the selection; an empty URL
 * or Remove clears it.
 * @returns {JSX.Element}
 */
function WysiwygLinkPopover({ editor }: { editor: Editor }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    // Read through useEditorState: the editor object never changes identity, so a
    // plain `editor.isActive()` call would be memoized by the React Compiler and
    // never see the selection move.
    const isActive = useEditorState({
        editor,
        selector: ({ editor: current }) => current.isActive('link'),
    });

    const openChange = (next: boolean): void => {
        if (next) {
            const previous = editor.getAttributes('link').href as
                | string
                | undefined;
            setUrl(previous ?? 'https://');
        }

        setOpen(next);
    };

    const applyLink = (): void => {
        const trimmed = url.trim();
        const chain = editor.chain().focus().extendMarkRange('link');

        if (trimmed === '') {
            chain.unsetLink().run();
        } else {
            chain.setLink({ href: trimmed }).run();
        }

        setOpen(false);
    };

    const removeLink = (): void => {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={openChange}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Toggle
                            variant="outline"
                            aria-label={t('richText.link')}
                            pressed={isActive}
                        >
                            <Link2 className="size-3.5" />
                        </Toggle>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('richText.link')}</TooltipContent>
            </Tooltip>
            <PopoverContent align="start" className="w-80">
                <Field>
                    <FieldLabel htmlFor="wysiwyg-link-url">
                        {t('richText.linkUrl')}
                    </FieldLabel>
                    <Input
                        id="wysiwyg-link-url"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                applyLink();
                            }
                        }}
                        data-test="wysiwyg-link-url"
                    />
                </Field>
                <div className="mt-3 flex justify-end gap-2">
                    {isActive ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={removeLink}
                        >
                            {t('richText.removeLink')}
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        onClick={applyLink}
                        data-test="wysiwyg-link-apply"
                    >
                        {t('richText.applyLink')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function WysiwygToolbar({ editor }: { editor: Editor }) {
    const { t } = useTranslation();
    // One snapshot per editor transaction (see WysiwygLinkPopover for why).
    const activeState = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            isBold: current.isActive('bold'),
            isItalic: current.isActive('italic'),
            isStrike: current.isActive('strike'),
            isHeading2: current.isActive('heading', { level: 2 }),
            isHeading3: current.isActive('heading', { level: 3 }),
            isBulletList: current.isActive('bulletList'),
            isOrderedList: current.isActive('orderedList'),
            isBlockquote: current.isActive('blockquote'),
            canUndo: current.can().undo(),
            canRedo: current.can().redo(),
        }),
    });

    return (
        <div className="flex flex-wrap gap-2 border-b p-1.5">
            <ButtonGroup>
                <ToolbarToggle
                    label={t('richText.bold')}
                    pressed={activeState.isBold}
                    onToggle={() => editor.chain().focus().toggleBold().run()}
                >
                    <Bold className="size-3.5" />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('richText.italic')}
                    pressed={activeState.isItalic}
                    onToggle={() => editor.chain().focus().toggleItalic().run()}
                >
                    <Italic className="size-3.5" />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('richText.strikethrough')}
                    pressed={activeState.isStrike}
                    onToggle={() => editor.chain().focus().toggleStrike().run()}
                >
                    <Strikethrough className="size-3.5" />
                </ToolbarToggle>
            </ButtonGroup>
            <ButtonGroup>
                <ToolbarToggle
                    label={t('richText.heading2')}
                    pressed={activeState.isHeading2}
                    onToggle={() =>
                        editor.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                >
                    <Heading2 className="size-3.5" />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('richText.heading3')}
                    pressed={activeState.isHeading3}
                    onToggle={() =>
                        editor.chain().focus().toggleHeading({ level: 3 }).run()
                    }
                >
                    <Heading3 className="size-3.5" />
                </ToolbarToggle>
            </ButtonGroup>
            <ButtonGroup>
                <ToolbarToggle
                    label={t('richText.bulletList')}
                    pressed={activeState.isBulletList}
                    onToggle={() =>
                        editor.chain().focus().toggleBulletList().run()
                    }
                >
                    <List className="size-3.5" />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('richText.orderedList')}
                    pressed={activeState.isOrderedList}
                    onToggle={() =>
                        editor.chain().focus().toggleOrderedList().run()
                    }
                >
                    <ListOrdered className="size-3.5" />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('richText.quote')}
                    pressed={activeState.isBlockquote}
                    onToggle={() =>
                        editor.chain().focus().toggleBlockquote().run()
                    }
                >
                    <Quote className="size-3.5" />
                </ToolbarToggle>
            </ButtonGroup>
            <WysiwygLinkPopover editor={editor} />
            <ButtonGroup>
                <ToolbarButton
                    label={t('richText.undo')}
                    disabled={!activeState.canUndo}
                    onClick={() => editor.chain().focus().undo().run()}
                >
                    <Undo2 className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    label={t('richText.redo')}
                    disabled={!activeState.canRedo}
                    onClick={() => editor.chain().focus().redo().run()}
                >
                    <Redo2 className="size-3.5" />
                </ToolbarButton>
            </ButtonGroup>
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
