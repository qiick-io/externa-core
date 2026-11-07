import { useTranslation } from 'react-i18next';
import { collectionMentionLabel } from '@/lib/item-chat-mentions';

/** A user or collection offered after `@` in Externa's chat composer. */
export type ChatMentionHit =
    | { type: 'user'; id: number; name: string; email?: string }
    | { type: 'collection'; id: number; name: string };

/** One mention option: the name, then the email or "Collection". */
export function ChatMentionHitLabel({ hit }: { hit: ChatMentionHit }) {
    const { t } = useTranslation();

    return (
        <>
            <span>
                {hit.type === 'collection'
                    ? collectionMentionLabel(hit)
                    : hit.name}
            </span>
            {hit.type === 'user' && hit.email ? (
                <span className="text-xs text-muted-foreground">
                    {hit.email}
                </span>
            ) : hit.type === 'collection' ? (
                <span className="text-xs text-muted-foreground">
                    {t('collections.itemChat.mentionCollection')}
                </span>
            ) : null}
        </>
    );
}
