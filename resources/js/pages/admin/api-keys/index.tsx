import { Head, router, useForm, usePage } from '@inertiajs/react';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import InputError from '@/components/input-error';
import { TablePagination } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import adminRoutes from '@/lib/admin-routes';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem, Paginated } from '@/types';

type ApiKeyRow = {
    id: number;
    name: string;
    key_prefix: string;
    role?: { id: number; name: string } | null;
    ip_allowlist?: string[] | null;
    rate_limit_per_minute?: number | null;
    expires_at?: string | null;
    last_used_at?: string | null;
    revoked_at?: string | null;
    created_at?: string;
};

type RoleOption = {
    id: number;
    name: string;
};

/**
 * List and create project API keys for the public CMS API.
 */
export default function AdminApiKeysIndex({
    apiKeys: apiKeysProp,
    roles,
    plainTextKey,
}: {
    apiKeys: LaravelPaginated<ApiKeyRow> | Paginated<ApiKeyRow>;
    roles: RoleOption[];
    plainTextKey?: string | null;
}) {
    const { t } = useTranslation();
    const page = usePage();
    const flashKey =
        plainTextKey ??
        (typeof page.props.flash === 'object' &&
        page.props.flash &&
        'plain_text_api_key' in page.props.flash
            ? String(
                  (page.props.flash as { plain_text_api_key?: string })
                      .plain_text_api_key ?? '',
              )
            : '');

    const apiKeys = normalizePaginated(apiKeysProp);
    const rows = apiKeys.data ?? [];

    const [ipText, setIpText] = useState('');

    const form = useForm({
        name: '',
        role_id: roles[0] ? String(roles[0].id) : '',
        ip_allowlist: '' as string,
        rate_limit_per_minute: '' as string,
        expires_at: '' as string,
    });

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.layout.title'),
            href: editProfile(),
        },
        {
            title: t('settings.layout.apiKeys'),
            href: adminRoutes.apiKeys.index(),
        },
    ];

    const submit = (e: React.FormEvent): void => {
        e.preventDefault();
        form.transform((data) => ({
            name: data.name,
            role_id: Number(data.role_id),
            ip_allowlist: ipText,
            rate_limit_per_minute: data.rate_limit_per_minute
                ? Number(data.rate_limit_per_minute)
                : null,
            expires_at: data.expires_at || null,
        }));
        form.post(adminRoutes.apiKeys.store(), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                setIpText('');
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.layout.apiKeys')} />

            <SettingsLayout wide>
            <div className="flex min-h-0 flex-1 flex-col gap-6">
                <div className="flex w-full flex-col gap-6">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {t('settings.layout.apiKeys')}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Bearer tokens for{' '}
                            <code className="text-xs">/api/v1</code>. Permissions
                            come from the selected role (use Public for
                            anonymous-equivalent access).
                        </p>
                    </div>

                    {(flashKey || plainTextKey) && (
                        <div
                            data-testid="api-key-secret"
                            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
                        >
                            <p className="font-medium">
                                Copy this key now — it will not be shown again.
                            </p>
                            <code
                                data-testid="api-key-secret-value"
                                className="mt-2 block break-all font-mono text-xs"
                            >
                                {plainTextKey || flashKey}
                            </code>
                        </div>
                    )}

                    <form
                        onSubmit={submit}
                        className="grid gap-4 rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border md:grid-cols-2"
                    >
                        <div className="grid gap-2">
                            <Label htmlFor="api_key_name">Name</Label>
                            <Input
                                id="api_key_name"
                                value={form.data.name}
                                onChange={(e) =>
                                    form.setData('name', e.target.value)
                                }
                                required
                            />
                            <InputError message={form.errors.name} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Role</Label>
                            <Select
                                value={form.data.role_id}
                                onValueChange={(v) =>
                                    form.setData('role_id', v)
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles.map((role) => (
                                        <SelectItem
                                            key={role.id}
                                            value={String(role.id)}
                                        >
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={form.errors.role_id} />
                        </div>
                        <div className="grid gap-2 md:col-span-2">
                            <Label htmlFor="ip_allowlist">
                                IP allowlist (optional, comma-separated)
                            </Label>
                            <Input
                                id="ip_allowlist"
                                value={ipText}
                                onChange={(e) => setIpText(e.target.value)}
                                placeholder="127.0.0.1, 10.0.0.0/8"
                            />
                            <InputError message={form.errors.ip_allowlist} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rate_limit">
                                Rate limit / minute (optional)
                            </Label>
                            <Input
                                id="rate_limit"
                                type="number"
                                min={1}
                                value={form.data.rate_limit_per_minute}
                                onChange={(e) =>
                                    form.setData(
                                        'rate_limit_per_minute',
                                        e.target.value,
                                    )
                                }
                            />
                            <InputError
                                message={form.errors.rate_limit_per_minute}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="expires_at">Expires at</Label>
                            <Input
                                id="expires_at"
                                type="datetime-local"
                                value={form.data.expires_at}
                                onChange={(e) =>
                                    form.setData('expires_at', e.target.value)
                                }
                            />
                            <InputError message={form.errors.expires_at} />
                        </div>
                        <div className="md:col-span-2">
                            <Button type="submit" disabled={form.processing}>
                                <KeyRound className="mr-2 size-4" />
                                Create API key
                            </Button>
                        </div>
                    </form>

                    <div className="overflow-hidden rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="px-3 py-2 text-left">
                                            Name
                                        </th>
                                        <th className="px-3 py-2 text-left">
                                            Prefix
                                        </th>
                                        <th className="px-3 py-2 text-left">
                                            Role
                                        </th>
                                        <th className="px-3 py-2 text-left">
                                            Status
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="text-muted-foreground px-3 py-6 text-center"
                                            >
                                                No API keys yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        rows.map((key) => (
                                            <tr
                                                key={key.id}
                                                className="border-b last:border-0"
                                            >
                                                <td className="px-3 py-2 font-medium">
                                                    {key.name}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-xs">
                                                    {key.key_prefix}…
                                                </td>
                                                <td className="px-3 py-2">
                                                    {key.role?.name ?? '—'}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {key.revoked_at
                                                        ? 'Revoked'
                                                        : 'Active'}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {!key.revoked_at && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                if (
                                                                    confirm(
                                                                        'Revoke this API key?',
                                                                    )
                                                                ) {
                                                                    router.delete(
                                                                        adminRoutes.apiKeys.destroy(
                                                                            key.id,
                                                                        ),
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {apiKeys.last_page > 1 ? (
                            <div className="flex justify-center border-t border-sidebar-border/70 px-4 py-3 dark:border-sidebar-border">
                                <TablePagination
                                    links={apiKeys.links ?? []}
                                />
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            </SettingsLayout>
        </AppLayout>
    );
}
