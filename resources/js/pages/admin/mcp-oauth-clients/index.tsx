import { Head, router, useForm } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/admin/data-table';
import { PageLayout } from '@/components/layout/page-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';

type OAuthClientRow = {
    id: string;
    name: string;
    redirect_hosts: string[];
    is_revoked: boolean;
    has_authorization: boolean;
    created_at: string | null;
};

type BlockedHostRow = {
    id: number;
    host: string;
    created_at: string | null;
};

type Props = {
    clients: OAuthClientRow[];
    blockedHosts: BlockedHostRow[];
    hasPassportKeys: boolean;
};

/**
 * Admin list of MCP OAuth clients: block a client or a redirect host (#815).
 *
 * The client name is self-asserted at registration; the redirect hosts identify it.
 */
export default function McpOAuthClientsIndex({
    clients,
    blockedHosts,
    hasPassportKeys,
}: Props) {
    const { t } = useTranslation();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('settings.layout.title'), href: editProfile() },
        {
            title: t('mcpOauthClients.title'),
            href: '/settings/mcp-oauth-clients',
        },
    ];
    const blockHostForm = useForm({ host: '' });

    const clientColumns: ColumnDef<OAuthClientRow>[] = [
        {
            id: 'name',
            header: t('mcpOauthClients.columns.name'),
            cell: ({ row }) => (
                <span data-test={`oauth-client-name-${row.original.id}`}>
                    {row.original.name}
                </span>
            ),
        },
        {
            id: 'hosts',
            header: t('mcpOauthClients.columns.hosts'),
            cell: ({ row }) => row.original.redirect_hosts.join(', ') || '—',
        },
        {
            id: 'status',
            header: t('mcpOauthClients.columns.status'),
            cell: ({ row }) =>
                row.original.is_revoked
                    ? t('mcpOauthClients.status.blocked')
                    : row.original.has_authorization
                      ? t('mcpOauthClients.status.authorized')
                      : t('mcpOauthClients.status.unused'),
        },
        {
            id: 'actions',
            header: t('mcpOauthClients.columns.actions'),
            cell: ({ row }) =>
                row.original.is_revoked ? null : (
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        data-test={`oauth-client-block-${row.original.id}`}
                        onClick={() =>
                            router.post(
                                `/settings/mcp-oauth-clients/${row.original.id}/block`,
                            )
                        }
                    >
                        {t('mcpOauthClients.blockClient')}
                    </Button>
                ),
        },
    ];

    const blockedHostColumns: ColumnDef<BlockedHostRow>[] = [
        {
            id: 'host',
            header: t('mcpOauthClients.columns.host'),
            cell: ({ row }) => row.original.host,
        },
        {
            id: 'actions',
            header: t('mcpOauthClients.columns.actions'),
            cell: ({ row }) => (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-test={`oauth-host-unblock-${row.original.id}`}
                    onClick={() =>
                        router.delete(
                            `/settings/mcp-oauth-clients/blocked-hosts/${row.original.id}`,
                        )
                    }
                >
                    {t('mcpOauthClients.unblockHost')}
                </Button>
            ),
        },
    ];

    const submitBlockHost = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        blockHostForm.post('/settings/mcp-oauth-clients/blocked-hosts', {
            onSuccess: () => blockHostForm.reset('host'),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('mcpOauthClients.title')} />
            <SettingsLayout wide>
                <PageLayout description={t('mcpOauthClients.description')}>
                    {!hasPassportKeys && (
                        <Alert variant="destructive" className="mb-6">
                            <AlertTitle>
                                {t('mcpOauthClients.missingKeysTitle')}
                            </AlertTitle>
                            <AlertDescription>
                                {t('mcpOauthClients.missingKeysDescription')}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="mb-8 space-y-3">
                        <h2 className="text-lg font-medium">
                            {t('mcpOauthClients.clientsTitle')}
                        </h2>
                        <DataTable
                            columns={clientColumns}
                            data={clients}
                            getRowId={(client) => client.id}
                            emptyState={
                                <span className="text-muted-foreground">
                                    {t('mcpOauthClients.emptyClients')}
                                </span>
                            }
                        />
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-lg font-medium">
                            {t('mcpOauthClients.blockedHostsTitle')}
                        </h2>
                        <form
                            onSubmit={submitBlockHost}
                            className="flex flex-wrap items-end gap-3"
                            noValidate
                        >
                            <Field
                                className="min-w-56 flex-1"
                                data-invalid={
                                    blockHostForm.errors.host ? true : undefined
                                }
                            >
                                <FieldLabel htmlFor="blocked-host">
                                    {t('mcpOauthClients.hostLabel')}
                                </FieldLabel>
                                <Input
                                    id="blocked-host"
                                    value={blockHostForm.data.host}
                                    onChange={(event) =>
                                        blockHostForm.setData(
                                            'host',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="claude.ai"
                                    autoComplete="off"
                                />
                                <FieldError>
                                    {blockHostForm.errors.host}
                                </FieldError>
                            </Field>
                            <Button
                                type="submit"
                                disabled={blockHostForm.processing}
                            >
                                {t('mcpOauthClients.blockHost')}
                            </Button>
                        </form>
                        <DataTable
                            columns={blockedHostColumns}
                            data={blockedHosts}
                            getRowId={(blockedHost) => String(blockedHost.id)}
                            emptyState={
                                <span className="text-muted-foreground">
                                    {t('mcpOauthClients.emptyBlockedHosts')}
                                </span>
                            }
                        />
                    </div>
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
