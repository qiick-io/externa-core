import { FileText, MoreVertical, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    Attachment,
    AttachmentAction,
    AttachmentActions,
    AttachmentContent,
    AttachmentDescription,
    AttachmentMedia,
    AttachmentTitle,
    AttachmentTrigger,
} from '@/components/ui/attachment';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { formatBytes } from '@/lib/format';
import {
    chatAttachmentUrl,
    saveChatAttachmentToFiles,
} from '@/lib/item-chat-api';
import type { ChatAttachment, ChatScope } from '@/lib/item-chat-api';

type ChatAttachmentFileProps = {
    attachment: ChatAttachment;
    scope: ChatScope;
    canCreateFiles: boolean;
    hasFileFields: boolean;
    onSaved: (attachment: ChatAttachment) => void;
    onAddToField: () => void;
};

/**
 * A sent (non-media) chat file on shadcn `Attachment`: icon, name and size,
 * opening the download on click, with a menu to download, save to Files or
 * add to a file field.
 */
export function ChatAttachmentFile({
    attachment,
    scope,
    canCreateFiles,
    hasFileFields,
    onSaved,
    onAddToField,
}: ChatAttachmentFileProps) {
    const { t } = useTranslation();
    const href = chatAttachmentUrl(scope, attachment.id);

    return (
        <Attachment
            size="sm"
            className="w-full"
            data-test="chat-attachment-file"
        >
            <AttachmentMedia>
                <FileText className="text-muted-foreground" />
            </AttachmentMedia>
            <AttachmentContent>
                <AttachmentTitle>{attachment.name}</AttachmentTitle>
                {attachment.size > 0 ? (
                    <AttachmentDescription>
                        {formatBytes(attachment.size)}
                    </AttachmentDescription>
                ) : null}
            </AttachmentContent>
            <AttachmentTrigger asChild>
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={attachment.name}
                />
            </AttachmentTrigger>
            <AttachmentActions>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <AttachmentAction
                            aria-label={t('collections.itemChat.more')}
                            onContextMenu={(event) => event.stopPropagation()}
                        >
                            <MoreVertical />
                        </AttachmentAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                            <a href={href} target="_blank" rel="noreferrer">
                                {t('collections.itemChat.download')}
                            </a>
                        </DropdownMenuItem>
                        {canCreateFiles ? (
                            <DropdownMenuItem
                                onSelect={() => {
                                    void saveChatAttachmentToFiles(
                                        scope,
                                        attachment.id,
                                    ).then((payload) =>
                                        onSaved(payload.attachment),
                                    );
                                }}
                            >
                                {t('collections.itemChat.saveToFiles')}
                            </DropdownMenuItem>
                        ) : null}
                        {hasFileFields ? (
                            <DropdownMenuItem onSelect={onAddToField}>
                                {t('collections.itemChat.addToField')}
                            </DropdownMenuItem>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </AttachmentActions>
        </Attachment>
    );
}

type ChatPendingFileProps = {
    name: string;
    size: number;
    progress: number;
    error: string | null;
    uploaded: boolean;
    onRemove: () => void;
};

/**
 * A file still on its way into a chat message, on shadcn `Attachment`: a
 * `Spinner` and the progress while it uploads, the error when it failed, and
 * a remove action.
 */
export function ChatPendingFile({
    name,
    size,
    progress,
    error,
    uploaded,
    onRemove,
}: ChatPendingFileProps) {
    const { t } = useTranslation();
    const state = error ? 'error' : uploaded ? 'done' : 'uploading';

    return (
        <Attachment
            size="xs"
            state={state}
            className="w-full"
            data-test="chat-pending-file"
        >
            <AttachmentMedia>
                {state === 'uploading' ? (
                    <Spinner />
                ) : state === 'error' ? (
                    <TriangleAlert />
                ) : (
                    <FileText className="text-muted-foreground" />
                )}
            </AttachmentMedia>
            <AttachmentContent>
                <AttachmentTitle>{name}</AttachmentTitle>
                <AttachmentDescription>
                    {error ??
                        (state === 'uploading' && progress > 0
                            ? `${progress}%`
                            : formatBytes(size))}
                </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
                <AttachmentAction
                    aria-label={t('collections.itemChat.removePendingFile')}
                    onClick={onRemove}
                >
                    <Trash2 />
                </AttachmentAction>
            </AttachmentActions>
        </Attachment>
    );
}
