import { Head, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { TruncatedText } from '@/components/admin/truncated-text';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';

type PendingRow = {
    id: number;
    uuid: string;
    tool: string;
    surface: string;
    arguments: Record<string, unknown>;
    expires_at: string | null;
    created_at: string | null;
    requester: { id: number; name: string; email: string } | null;
};

/**
 * MCP AI tool calls waiting for human approval.
 */
export default function PendingToolCallsIndex({
    pending,
}: {
    pending: PendingRow[];
}) {
    const { t } = useTranslation();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('settings.layout.title'), href: editProfile() },
        {
            title: t('settings.layout.pendingToolCalls'),
            href: '/settings/pending-tool-calls',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('pendingToolCalls.head')} />
            <SettingsLayout wide>
                <PageLayout description={t('pendingToolCalls.description')}>
                    <TablePanel>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left">
                                    <th className="p-2">
                                        {t('pendingToolCalls.colTool')}
                                    </th>
                                    <th className="p-2">
                                        {t('pendingToolCalls.colArgs')}
                                    </th>
                                    <th className="p-2">
                                        {t('pendingToolCalls.colRequester')}
                                    </th>
                                    <th className="p-2">
                                        {t('pendingToolCalls.colExpires')}
                                    </th>
                                    <th className="p-2 text-right">
                                        {t('pendingToolCalls.colActions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {pending.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="p-3 text-muted-foreground"
                                        >
                                            {t('pendingToolCalls.empty')}
                                        </td>
                                    </tr>
                                ) : (
                                    pending.map((row) => (
                                        <tr
                                            key={row.uuid}
                                            className="border-b align-top last:border-0"
                                        >
                                            <td className="p-2 font-medium">
                                                {row.tool}
                                                <div className="text-xs text-muted-foreground">
                                                    {row.surface}
                                                </div>
                                            </td>
                                            <td className="max-w-md p-2 font-mono text-xs text-muted-foreground">
                                                <TruncatedText
                                                    text={JSON.stringify(
                                                        row.arguments ?? {},
                                                    )}
                                                />
                                            </td>
                                            <td className="p-2">
                                                {row.requester?.name ?? '—'}
                                            </td>
                                            <td className="p-2 whitespace-nowrap">
                                                {row.expires_at ?? '—'}
                                            </td>
                                            <td className="space-x-2 p-2 text-right whitespace-nowrap">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() =>
                                                        router.post(
                                                            `/settings/pending-tool-calls/${row.id}/approve`,
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'pendingToolCalls.approve',
                                                    )}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        router.post(
                                                            `/settings/pending-tool-calls/${row.id}/reject`,
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'pendingToolCalls.reject',
                                                    )}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </TablePanel>
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
