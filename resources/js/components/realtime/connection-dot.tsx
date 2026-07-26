import { useTranslation } from 'react-i18next';
import { useEchoConnection } from '@/hooks/use-echo-connection';
import { cn } from '@/lib/utils';
import type { EchoConnectionState } from '@/lib/echo';

function toneFor(state: EchoConnectionState): string {
    switch (state) {
        case 'connected':
            return 'bg-emerald-500';
        case 'connecting':
            return 'bg-amber-400 animate-pulse';
        case 'disabled':
            return 'bg-muted-foreground/40';
        default:
            return 'bg-destructive';
    }
}

/**
 * Presence-style badge for the Reverb WebSocket connection.
 * Absolute-position on the avatar’s top-right (parent must be `relative`).
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
        <span
            className={cn(
                'pointer-events-none absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar',
                toneFor(state),
                className,
            )}
            title={label}
            aria-label={label}
            role="status"
            data-test="realtime-connection-dot"
            data-state={state}
        />
    );
}
