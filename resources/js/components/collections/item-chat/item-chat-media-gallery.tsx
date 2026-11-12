import { MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMediaAlbum } from '@/components/chat/chat-media-album';
import { ChatMediaLightbox } from '@/components/chat/chat-media-lightbox';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    chatAttachmentPreviewUrl,
    chatAttachmentUrl,
    saveChatAttachmentToFiles,
} from '@/lib/item-chat-api';
import type { ChatAttachment, ChatScope } from '@/lib/item-chat-api';

/**
 * Image and video attachments of one message: the album inside the bubble, a per-item
 * menu (download, save to files, add to a file field) and the lightbox.
 */
export function ChatMediaGallery({
    items,
    scope,
    canCreateFiles,
    hasFileFields,
    onSaved,
    onAddToField,
}: {
    items: ChatAttachment[];
    scope: ChatScope;
    canCreateFiles: boolean;
    hasFileFields: boolean;
    onSaved: (attachment: ChatAttachment) => void;
    onAddToField: (attachment: ChatAttachment) => void;
}) {
    const { t } = useTranslation();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    if (items.length === 0) {
        return null;
    }

    return (
        <>
            <ChatMediaAlbum
                items={items.map((attachment) => ({
                    key: attachment.id,
                    src: chatAttachmentPreviewUrl(scope, attachment),
                    isVideo: attachment.mime.startsWith('video/'),
                    name: attachment.name,
                }))}
                mediaPreviewLabel={t('collections.itemChat.mediaPreview')}
                onMediaClick={setLightboxIndex}
                renderOverlay={(_, index) => {
                    const attachment = items[index]!;
                    const originalHref = chatAttachmentUrl(
                        scope,
                        attachment.id,
                    );

                    return (
                        <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/media:opacity-100 focus-within:opacity-100">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="secondary"
                                        className="size-7 bg-background/80 shadow-sm backdrop-blur"
                                        aria-label={t(
                                            'collections.itemChat.more',
                                        )}
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                        onContextMenu={(event) =>
                                            event.stopPropagation()
                                        }
                                    >
                                        <MoreVertical className="size-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                        <a
                                            href={originalHref}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
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
                                            {t(
                                                'collections.itemChat.saveToFiles',
                                            )}
                                        </DropdownMenuItem>
                                    ) : null}
                                    {hasFileFields ? (
                                        <DropdownMenuItem
                                            onSelect={() =>
                                                onAddToField(attachment)
                                            }
                                        >
                                            {t(
                                                'collections.itemChat.addToField',
                                            )}
                                        </DropdownMenuItem>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                }}
            />

            <ChatMediaLightbox
                open={lightboxIndex !== null}
                items={items}
                initialIndex={lightboxIndex ?? 0}
                scope={scope}
                onOpenChange={(next) => {
                    if (!next) {
                        setLightboxIndex(null);
                    }
                }}
            />
        </>
    );
}
