import { Head, router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiModelStatusBadge } from '@/components/ai/ai-model-status-badge';
import type { AiModelStatus } from '@/components/ai/ai-model-status-badge';
import Heading from '@/components/heading';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
} from '@/components/ui/field';
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

type ToolRow = {
    name: string;
    kind: string;
    description: string;
};

type ConfiguredModelRow = {
    usage: 'assistant' | 'default' | 'translate' | 'item_drafts' | 'embeddings';
    provider: string;
    model: string | null;
    status: AiModelStatus;
};

type CatalogModelRow = {
    provider: string;
    model: string;
    capabilities: string[];
    status: AiModelStatus;
};

/**
 * Opt-in toggles for mutating AI tool classes (env kill switch still applies), plus the
 * configured models and the curated model catalog with their status badges (#370).
 */
export default function AiToolSettingsPage({
    writeEnabled,
    enabledTools,
    tools,
    approvalTtlMinutes,
    auditRetentionDays,
    configuredModels,
    catalogModels,
}: {
    writeEnabled: boolean;
    enabledTools: string[];
    tools: ToolRow[];
    approvalTtlMinutes: number;
    auditRetentionDays: number;
    configuredModels: ConfiguredModelRow[];
    catalogModels: CatalogModelRow[];
}) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<string[]>(enabledTools);
    const [saving, setSaving] = useState(false);
    const [recentlySuccessful, setRecentlySuccessful] = useState(false);
    const isDirty =
        selected.length !== enabledTools.length ||
        selected.some((name) => !enabledTools.includes(name));

    useEffect(() => {
        if (!recentlySuccessful) {
            return;
        }

        const timeoutId = window.setTimeout(
            () => setRecentlySuccessful(false),
            2000,
        );

        return () => window.clearTimeout(timeoutId);
    }, [recentlySuccessful]);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.aiTools.breadcrumb'),
            href: '/settings/ai-tools',
        },
    ];

    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const deprecatedModelNames = configuredModels
        .filter((configuredModel) => configuredModel.status === 'deprecated')
        .map((configuredModel) => configuredModel.model ?? '');

    const toggle = (name: string, checked: boolean): void => {
        setSelected((prev) => {
            if (checked) {
                return prev.includes(name) ? prev : [...prev, name];
            }

            return prev.filter((item) => item !== name);
        });
    };

    const save = (): void => {
        setSaving(true);
        router.put(
            '/settings/ai-tools',
            { write_tools: selected },
            {
                preserveScroll: true,
                onSuccess: () => setRecentlySuccessful(true),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.aiTools.head')} />
            <SettingsLayout>
                <form
                    className="space-y-6"
                    onSubmit={(event) => {
                        event.preventDefault();
                        save();
                    }}
                >
                    <Heading
                        variant="small"
                        title={t('settings.aiTools.title')}
                        description={t('settings.aiTools.description')}
                    />

                    <div className="rounded-md border border-border p-4 text-sm">
                        <p>
                            {t('settings.aiTools.killSwitchLabel')}:{' '}
                            <span className="font-medium">
                                {writeEnabled
                                    ? t('settings.aiTools.killSwitchOn')
                                    : t('settings.aiTools.killSwitchOff')}
                            </span>
                        </p>
                        <p className="mt-2 text-muted-foreground">
                            {t('settings.aiTools.killSwitchHint')}
                        </p>
                        <p className="mt-2 text-muted-foreground">
                            {t('settings.aiTools.ttlHint', {
                                minutes: approvalTtlMinutes,
                                days: auditRetentionDays,
                            })}
                        </p>
                    </div>

                    <div className="space-y-3">
                        {tools.map((tool) => (
                            <Field
                                key={tool.name}
                                orientation="horizontal"
                                className="rounded-md border border-border p-3"
                                data-test={`ai-tool-${tool.name}`}
                            >
                                <Checkbox
                                    id={`tool-${tool.name}`}
                                    checked={selectedSet.has(tool.name)}
                                    disabled={!writeEnabled}
                                    onCheckedChange={(value) =>
                                        toggle(tool.name, value === true)
                                    }
                                />
                                <FieldContent>
                                    <FieldLabel htmlFor={`tool-${tool.name}`}>
                                        {tool.name}
                                        <span className="text-xs font-normal text-muted-foreground">
                                            ({tool.kind})
                                        </span>
                                    </FieldLabel>
                                    <FieldDescription>
                                        {tool.description}
                                    </FieldDescription>
                                </FieldContent>
                            </Field>
                        ))}
                    </div>

                    <SettingsFormActions
                        processing={saving}
                        recentlySuccessful={recentlySuccessful}
                        isDirty={isDirty}
                        data-test="ai-tools-settings-save"
                    />
                </form>

                <section className="space-y-4" data-test="ai-models">
                    <Heading
                        variant="small"
                        title={t('settings.aiTools.models.title')}
                        description={t('settings.aiTools.models.description')}
                    />

                    {deprecatedModelNames.length > 0 && (
                        <Alert variant="warning" role="status">
                            <TriangleAlert aria-hidden="true" />
                            <AlertDescription>
                                {t(
                                    'settings.aiTools.models.deprecatedWarning',
                                    {
                                        models: [
                                            ...new Set(deprecatedModelNames),
                                        ].join(', '),
                                    },
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    {t('settings.aiTools.models.usage')}
                                </TableHead>
                                <TableHead>
                                    {t('settings.aiTools.models.provider')}
                                </TableHead>
                                <TableHead>
                                    {t('settings.aiTools.models.model')}
                                </TableHead>
                                <TableHead>
                                    {t('settings.aiTools.models.statusLabel')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {configuredModels.map((configuredModel) => (
                                <TableRow
                                    key={`${configuredModel.usage}-${configuredModel.provider}`}
                                >
                                    <TableCell>
                                        {t(
                                            `settings.aiTools.models.usages.${configuredModel.usage}`,
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {configuredModel.provider}
                                    </TableCell>
                                    <TableCell className="font-mono">
                                        {configuredModel.model ?? '-'}
                                    </TableCell>
                                    <TableCell>
                                        <AiModelStatusBadge
                                            status={configuredModel.status}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <Heading
                        variant="small"
                        title={t('settings.aiTools.models.catalogTitle')}
                        description={t(
                            'settings.aiTools.models.catalogDescription',
                        )}
                    />

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    {t('settings.aiTools.models.provider')}
                                </TableHead>
                                <TableHead>
                                    {t('settings.aiTools.models.model')}
                                </TableHead>
                                <TableHead>
                                    {t('settings.aiTools.models.capabilities')}
                                </TableHead>
                                <TableHead>
                                    {t('settings.aiTools.models.statusLabel')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {catalogModels.map((catalogModel) => (
                                <TableRow
                                    key={`${catalogModel.provider}-${catalogModel.model}`}
                                >
                                    <TableCell>
                                        {catalogModel.provider}
                                    </TableCell>
                                    <TableCell className="font-mono">
                                        {catalogModel.model}
                                    </TableCell>
                                    <TableCell>
                                        {catalogModel.capabilities
                                            .map((capability) =>
                                                t(
                                                    `settings.aiTools.models.capability.${capability}`,
                                                ),
                                            )
                                            .join(', ')}
                                    </TableCell>
                                    <TableCell>
                                        <AiModelStatusBadge
                                            status={catalogModel.status}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </section>
            </SettingsLayout>
        </AppLayout>
    );
}
