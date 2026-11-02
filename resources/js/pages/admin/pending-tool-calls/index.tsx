import { Head, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { TruncatedText } from '@/components/admin/truncated-text';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import type { BreadcrumbItem } from '@/types';
import { edit as editProfile } from '@/routes/profile';

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
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('pendingToolCalls.colTool')}
                                    </TableHead>
                                    <TableHead>
                                        {t('pendingToolCalls.colArgs')}
                                    </TableHead>
                                    <TableHead>
                                        {t('pendingToolCalls.colRequester')}
                                    </TableHead>
                                    <TableHead className="text-right">
                                        {t('pendingToolCalls.colExpires')}
                                    </TableHead>
                                    <TableHead className="text-right">
                                        {t('pendingToolCalls.colActions')}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pending.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="text-muted-foreground"
                                        >
                                            {t('pendingToolCalls.empty')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pending.map((row) => (
                                        <TableRow
                                            key={row.uuid}
                                            className="align-top"
                                        >
                                            <TableCell className="font-medium">
                                                {row.tool}
                                                <div className="text-xs text-muted-foreground">
                                                    {row.surface}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-md font-mono text-xs text-muted-foreground">
                                                <TruncatedText
                                                    text={JSON.stringify(
                                                        row.arguments ?? {},
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {row.requester?.name ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap tabular-nums">
                                                {row.expires_at ?? '—'}
                                            </TableCell>
                                            <TableCell className="space-x-2 text-right whitespace-nowrap">
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
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TablePanel>
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
