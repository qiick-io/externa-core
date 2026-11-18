import { commands } from '@uiw/react-md-editor';
import type { ICommand } from '@uiw/react-md-editor';
import {
    Bold,
    ChevronDown,
    Code2,
    Eye,
    FileText,
    FolderOpen,
    Heading,
    ImageIcon,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    Strikethrough,
    Table2,
    Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToolbarButton } from '@/components/collections/rich-inputs/rich-text-toolbar-controls';
import { markdownHeadingCommands } from '@/components/collections/rich-inputs/use-markdown-shortcuts';
import { ShortcutKeys } from '@/components/collections/shortcut-keys';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
    const { t } = useTranslation();

    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => {
                if (next === 'edit' || next === 'preview') {
                    onChange(next);
                }
            }}
            className="justify-start"
            disabled={disabled}
        >
            <ToggleGroupItem
                value="edit"
                aria-label={t('richText.edit')}
                className="px-2"
            >
                <FileText className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
                value="preview"
                aria-label={t('richText.preview')}
                className="px-2"
            >
                <Eye className="size-3.5" />
            </ToggleGroupItem>
        </ToggleGroup>
    );
}

/**
 * Markdown actions with WYSIWYG-matching chrome.
 * Drive @uiw textarea via orchestrator.
 */
export function MarkdownToolbar({
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
    const { t } = useTranslation();

    return (
        <div className="flex flex-wrap gap-2 border-b p-1.5">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5 px-2"
                        aria-label={t('richText.heading')}
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
                                {t('richText.headingLevel', { level })}
                                <DropdownMenuShortcut>
                                    <ShortcutKeys
                                        keys={['⌘', '⌥', String(level)]}
                                    />
                                </DropdownMenuShortcut>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
            <ButtonGroup>
                <ToolbarButton
                    label={t('richText.bold')}
                    disabled={disabled}
                    onClick={() => onRun(commands.bold)}
                >
                    <Bold className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    label={t('richText.italic')}
                    disabled={disabled}
                    onClick={() => onRun(commands.italic)}
                >
                    <Italic className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    label={t('richText.strikethrough')}
                    disabled={disabled}
                    onClick={() => onRun(commands.strikethrough)}
                >
                    <Strikethrough className="size-3.5" />
                </ToolbarButton>
            </ButtonGroup>
            <ButtonGroup>
                <ToolbarButton
                    label={t('richText.bulletList')}
                    disabled={disabled}
                    onClick={() => onRun(commands.unorderedListCommand)}
                >
                    <List className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    label={t('richText.orderedList')}
                    disabled={disabled}
                    onClick={() => onRun(commands.orderedListCommand)}
                >
                    <ListOrdered className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    label={t('richText.quote')}
                    disabled={disabled}
                    onClick={() => onRun(commands.quote)}
                >
                    <Quote className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    label={t('richText.code')}
                    disabled={disabled}
                    onClick={() => onRun(commands.code)}
                >
                    <Code2 className="size-3.5" />
                </ToolbarButton>
            </ButtonGroup>
            <ToolbarButton
                label={t('richText.link')}
                disabled={disabled}
                onClick={() => onRun(commands.link)}
            >
                <Link2 className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
                label={t('richText.table')}
                disabled={disabled}
                onClick={onOpenTable}
            >
                <Table2 className="size-3.5" />
            </ToolbarButton>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="px-2"
                        aria-label={t('richText.image')}
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
                        {t('richText.imageFromComputer')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="min-h-10 gap-2 py-2.5"
                        onSelect={onImageFromLibrary}
                    >
                        <FolderOpen className="size-4" />
                        {t('richText.imageFromLibrary')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="min-h-10 gap-2 py-2.5"
                        onSelect={onImageFromUrl}
                    >
                        <Link2 className="size-4" />
                        {t('richText.imageFromUrl')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
