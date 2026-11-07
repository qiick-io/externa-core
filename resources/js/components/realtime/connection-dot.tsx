import { useTranslation } from 'react-i18next';
import { AvatarBadge } from '@/components/ui/avatar';
import { useEchoConnection } from '@/hooks/use-echo-connection';
import type { EchoConnectionState } from '@/lib/echo';
import { cn } from '@/lib/utils';

/**
 * Green when connected, amber while connecting, grey when realtime is off, red
 * only when the connection is lost (an error, unlike a user being offline).
 */
function toneFor(state: EchoConnectionState): string {
    switch (state) {
        case 'connected':
            return 'bg-success';
        case 'connecting':
            return 'bg-warning animate-pulse';
        case 'disabled':
            return 'bg-muted-foreground';
        default:
            return 'bg-destructive';
    }
}

/**
 * The Reverb WebSocket connection as an `AvatarBadge`: render it inside
 * `<Avatar>`, so it sits bottom-right like every presence dot.
 */
export function ConnectionDot({ className }: { className?: string }) {
    const { t } = useTranslation();
    const state = useEchoConnection();

    const label =
        state === 'connected'
            ? t('realtime.connected')
            : state === 'connecting'
              ? t('realtime.connecting')
              : state === 'disabled'
                ? t('realtime.disabled')
                : t('realtime.offline');

    return (
        <AvatarBadge
            className={cn('pointer-events-none', toneFor(state), className)}
            title={label}
            aria-label={label}
            role="status"
            data-test="realtime-connection-dot"
            data-state={state}
        />
    );
}
