import { Form, Head, router } from '@inertiajs/react';
import { GripVertical, Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { ContentLocalesField } from '@/components/settings/content-locales-field';
import { TransformPresetsField } from '@/components/settings/transform-presets-field';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import type { ContentLocaleCatalogEntry } from '@/lib/content-locales-catalog';
import { createSortableList } from '@/lib/create-sortable-list';
import { cn } from '@/lib/utils';
import { edit as editProject } from '@/routes/project';
import type {
    BreadcrumbItem,
    ProjectRoleOption,
    ProjectSettingsForm,
    SidebarModuleSetting,
    TransformPreset,
} from '@/types';

type Props = {
    project: ProjectSettingsForm;
    roles: ProjectRoleOption[];
    availableLocales: Record<string, string>;
    contentLocaleCatalog: ContentLocaleCatalogEntry[];
    passwordPolicies: Array<'weak' | 'medium' | 'strong'>;
    transformationOptions: string[];
    transformFits: TransformPreset['fit'][];
    transformFormats: TransformPreset['format'][];
};

/** Matches config('settings.project.sidebar_pinned_module_ids'). */
const PINNED_SIDEBAR_MODULE_IDS = new Set(['ai']);

function buildProjectFormState(project: ProjectSettingsForm) {
    return {
        ...project,
        name: project.name ?? '',
        description: project.description ?? '',
        url: project.url ?? '',
        default_user_role: project.default_user_role ?? '',
        allowed_domains: (project.allowed_domains ?? []).join(', '),
        public_api_allowed_origins: (
            project.public_api_allowed_origins ?? []
        ).join('\n'),
        preset_transformations: project.preset_transformations ?? [],
        report_issue_url: project.report_issue_url ?? '',
        report_bug_url: project.report_bug_url ?? '',
        report_error_url: project.report_error_url ?? '',
        webhook_url: project.webhook_url ?? '',
        webhook_secret: '',
        sidebar_modules: pinSidebarModules(project.sidebar_modules),
        allowed_transformations: project.allowed_transformations ?? [],
        content_locales: project.content_locales ?? ['en', 'it'],
        default_content_locale:
            project.default_content_locale ??
            project.content_locales?.[0] ??
            'en',
        fallback_content_locales: project.fallback_content_locales ??
            project.content_locales ?? ['en', 'it'],
    };
}

function presetTransformErrors(
    errors: Record<string, string | undefined>,
): string | undefined {
    if (errors.preset_transformations) {
        return errors.preset_transformations;
    }

    const nested = Object.entries(errors)
        .filter(([key]) => key.startsWith('preset_transformations'))
        .map(([, message]) => message)
        .filter((message): message is string => Boolean(message));

    return nested.length > 0 ? nested.join(' ') : undefined;
}

function pinSidebarModules(
    modules: SidebarModuleSetting[],
): SidebarModuleSetting[] {
    const pinned = [...PINNED_SIDEBAR_MODULE_IDS]
        .map((id) => modules.find((module) => module.id === id))
        .filter((module): module is SidebarModuleSetting => !!module);
    const rest = modules.filter(
        (module) => !PINNED_SIDEBAR_MODULE_IDS.has(module.id),
    );

    return [...pinned, ...rest];
}

function ModuleRowContent({
    module,
    label,
    onToggle,
    dragHandle,
}: {
    module: SidebarModuleSetting;
    label: string;
    onToggle: (enabled: boolean) => void;
    dragHandle?: ReactNode;
}) {
    return (
        <>
            {dragHandle ?? (
                <span
                    className="flex size-4 items-center justify-center text-muted-foreground/40"
                    aria-hidden
                >
                    <Lock className="size-3.5" />
                </span>
            )}
            <Checkbox
                id={`module-${module.id}`}
                checked={module.enabled}
                disabled={module.locked}
                onCheckedChange={(checked) => onToggle(checked === true)}
            />
            <Label
                htmlFor={`module-${module.id}`}
                className={cn(
                    'flex-1',
                    module.locked && 'text-muted-foreground',
                )}
            >
                {label}
                {module.locked ? ' *' : ''}
            </Label>
        </>
    );
}

function PinnedModuleRow({
    module,
    label,
    onToggle,
}: {
    module: SidebarModuleSetting;
    label: string;
    onToggle: (enabled: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <ModuleRowContent
                module={module}
                label={label}
                onToggle={onToggle}
            />
        </div>
    );
}

function ModuleRow({
    module,
    label,
    onToggle,
}: {
    module: SidebarModuleSetting;
    label: string;
    onToggle: (enabled: boolean) => void;
}) {
    return (
        <div
            data-id={module.id}
            className="flex items-center gap-3 rounded-md border px-3 py-2"
        >
            <ModuleRowContent
                module={module}
                label={label}
                onToggle={onToggle}
                dragHandle={
                    <button
                        type="button"
                        className="drag-handle cursor-grab touch-none text-muted-foreground hover:text-foreground"
                        aria-label="Reorder"
                    >
                        <GripVertical className="size-4" />
                    </button>
                }
            />
        </div>
    );
}

/**
 * Project-level settings (general, sidebar, security, registration, files, reporting).
 */
export default function ProjectSettingsPage({
    project,
    roles,
    availableLocales,
    contentLocaleCatalog,
    passwordPolicies,
    transformationOptions,
    transformFits,
    transformFormats,
}: Props) {
    const { t } = useTranslation();
    const initialForm = useMemo(() => buildProjectFormState(project), [project]);
    const [form, setFormState] = useState(initialForm);
    const [isDirty, setIsDirty] = useState(false);
    const [sendingTestWebhook, setSendingTestWebhook] = useState(false);

    const setForm: Dispatch<SetStateAction<typeof initialForm>> = (
        action,
    ) => {
        setIsDirty(true);
        setFormState(action);
    };

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: () => {
            setFormState(initialForm);
            setIsDirty(false);
        },
    });

    const sortableModulesRef = useRef<HTMLDivElement>(null);
    const formRef = useRef(form);
    formRef.current = form;
    const setFormRef = useRef(setForm);
    setFormRef.current = setForm;

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.project.breadcrumb'),
            href: editProject(),
        },
    ];

    const moduleLabel = (id: string): string => {
        const key = `settings.project.modules.${id}`;
        const translated = t(key);

        return translated === key ? id : translated;
    };

    const pinnedModules = pinSidebarModules(form.sidebar_modules).filter(
        (module) => PINNED_SIDEBAR_MODULE_IDS.has(module.id),
    );
    const sortableModules = form.sidebar_modules.filter(
        (module) => !PINNED_SIDEBAR_MODULE_IDS.has(module.id),
    );
    const sortableModuleKey = sortableModules.map((module) => module.id).join('\0');

    useEffect(() => {
        const el = sortableModulesRef.current;

        if (!el || sortableModules.length === 0) {
            return;
        }

        const sortable = createSortableList(el, {
            handle: '.drag-handle',
            onEnd: () => {
                const order = sortable.toArray();
                const prev = formRef.current.sidebar_modules
                    .filter((module) => !PINNED_SIDEBAR_MODULE_IDS.has(module.id))
                    .map((module) => module.id);

                if (order.length === 0 || order.join('\0') === prev.join('\0')) {
                    return;
                }

                setFormRef.current((current) => {
                    const byId = new Map(
                        current.sidebar_modules.map((module) => [
                            module.id,
                            module,
                        ]),
                    );
                    const reordered = order
                        .map((id) => byId.get(id))
                        .filter(
                            (module): module is SidebarModuleSetting =>
                                !!module,
                        );

                    return {
                        ...current,
                        sidebar_modules: pinSidebarModules([
                            ...current.sidebar_modules.filter((module) =>
                                PINNED_SIDEBAR_MODULE_IDS.has(module.id),
                            ),
                            ...reordered,
                        ]),
                    };
                });
            },
        });

        return () => sortable.destroy();
        // ponytail: remount when set membership changes; order sync is onEnd-only
    }, [sortableModuleKey]);

    const toggleModule = (moduleId: string, enabled: boolean): void => {
        setForm((current) => ({
            ...current,
            sidebar_modules: current.sidebar_modules.map((entry) =>
                entry.id === moduleId ? { ...entry, enabled } : entry,
            ),
        }));
    };

    const generateWebhookSecret = (): void => {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const secret = Array.from(bytes, (byte) =>
            byte.toString(16).padStart(2, '0'),
        ).join('');
        setForm((current) => ({ ...current, webhook_secret: secret }));
    };

    const sendTestWebhook = (): void => {
        setSendingTestWebhook(true);
        router.post(
            ProjectSettingsController.sendTestWebhook.url(),
            {},
            {
                preserveScroll: true,
                onFinish: () => setSendingTestWebhook(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.head')} />

            <h1 className="sr-only">{t('settings.project.head')}</h1>

            <SettingsLayout>
                <Form
                    {...ProjectSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
                            <input
                                type="hidden"
                                name="sidebar_modules"
                                value={JSON.stringify(
                                    pinSidebarModules(form.sidebar_modules),
                                )}
                            />
                            <input
                                type="hidden"
                                name="allowed_transformations"
                                value={JSON.stringify(
                                    form.allowed_transformations,
                                )}
                            />
                            <input
                                type="hidden"
                                name="preset_transformations"
                                value={JSON.stringify(
                                    form.preset_transformations,
                                )}
                            />
                            <input
                                type="hidden"
                                name="registration_enabled"
                                value={form.registration_enabled ? '1' : '0'}
                            />
                            <input
                                type="hidden"
                                name="email_verification_required"
                                value={
                                    form.email_verification_required ? '1' : '0'
                                }
                            />
                            <input
                                type="hidden"
                                name="two_factor_required"
                                value={form.two_factor_required ? '1' : '0'}
                            />
                            <input
                                type="hidden"
                                name="default_language"
                                value={form.default_language}
                            />
                            <input
                                type="hidden"
                                name="content_locales"
                                value={JSON.stringify(form.content_locales)}
                            />
                            <input
                                type="hidden"
                                name="default_content_locale"
                                value={form.default_content_locale}
                            />
                            <input
                                type="hidden"
                                name="fallback_content_locales"
                                value={JSON.stringify(
                                    form.fallback_content_locales,
                                )}
                            />
                            <input
                                type="hidden"
                                name="password_policy"
                                value={form.password_policy}
                            />
                            <input
                                type="hidden"
                                name="default_user_role"
                                value={form.default_user_role}
                            />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.generalTitle')}
                                    description={t(
                                        'settings.project.generalDescription',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="name">
                                        {t('settings.project.name')}
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={form.name}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                name: event.target.value,
                                            }))
                                        }
                                    />
                                    <InputError message={errors.name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="description">
                                        {t('settings.project.description')}
                                    </Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        value={form.description}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                description: event.target.value,
                                            }))
                                        }
                                    />
                                    <InputError message={errors.description} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="url">
                                        {t('settings.project.url')}
                                    </Label>
                                    <Input
                                        id="url"
                                        name="url"
                                        type="url"
                                        value={form.url}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                url: event.target.value,
                                            }))
                                        }
                                        placeholder="https://example.com"
                                    />
                                    <InputError message={errors.url} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="default_language">
                                        {t('settings.project.defaultLanguage')}
                                    </Label>
                                    <Select
                                        value={form.default_language}
                                        onValueChange={(value) =>
                                            setForm((current) => ({
                                                ...current,
                                                default_language: value,
                                            }))
                                        }
                                    >
                                        <SelectTrigger
                                            id="default_language"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(
                                                availableLocales,
                                            ).map(([code, label]) => (
                                                <SelectItem
                                                    key={code}
                                                    value={code}
                                                >
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <InputError
                                        message={errors.default_language}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.contentLocalesTitle',
                                    )}
                                    description={t(
                                        'settings.project.contentLocalesDescription',
                                    )}
                                />

                                <ContentLocalesField
                                    catalog={contentLocaleCatalog}
                                    value={form.content_locales}
                                    defaultLocale={form.default_content_locale}
                                    onChange={(locales, defaultLocale) =>
                                        setForm((current) => ({
                                            ...current,
                                            content_locales: locales,
                                            default_content_locale:
                                                defaultLocale,
                                            fallback_content_locales: [
                                                defaultLocale,
                                                ...locales.filter(
                                                    (code) =>
                                                        code !== defaultLocale,
                                                ),
                                            ],
                                        }))
                                    }
                                />
                                <InputError
                                    message={
                                        errors.content_locales ??
                                        errors.default_content_locale ??
                                        errors['content_locales.0']
                                    }
                                />
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.sidebarTitle')}
                                    description={t(
                                        'settings.project.sidebarDescription',
                                    )}
                                />
                                <div className="space-y-2">
                                    {pinnedModules.map((module) => (
                                        <PinnedModuleRow
                                            key={module.id}
                                            module={module}
                                            label={moduleLabel(module.id)}
                                            onToggle={(enabled) =>
                                                toggleModule(module.id, enabled)
                                            }
                                        />
                                    ))}
                                    <div
                                        ref={sortableModulesRef}
                                        className="space-y-2"
                                    >
                                        {sortableModules.map((module) => (
                                            <ModuleRow
                                                key={module.id}
                                                module={module}
                                                label={moduleLabel(module.id)}
                                                onToggle={(enabled) =>
                                                    toggleModule(
                                                        module.id,
                                                        enabled,
                                                    )
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>
                                <InputError message={errors.sidebar_modules} />
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.securityTitle')}
                                    description={t(
                                        'settings.project.securityDescription',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="password_policy">
                                        {t('settings.project.passwordPolicy')}
                                    </Label>
                                    <Select
                                        value={form.password_policy}
                                        onValueChange={(value) => {
                                            if (
                                                value === 'weak' ||
                                                value === 'medium' ||
                                                value === 'strong'
                                            ) {
                                                setForm((current) => ({
                                                    ...current,
                                                    password_policy: value,
                                                }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            id="password_policy"
                                            className="w-full"
                                        >
                                            <SelectValue>
                                                {t(
                                                    `settings.project.passwordPolicies.${form.password_policy}.label`,
                                                )}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {passwordPolicies.map((policy) => (
                                                <SelectItem
                                                    key={policy}
                                                    value={policy}
                                                    textValue={t(
                                                        `settings.project.passwordPolicies.${policy}.label`,
                                                    )}
                                                    className="items-start py-2"
                                                >
                                                    <span className="flex flex-col gap-0.5 text-left">
                                                        <span>
                                                            {t(
                                                                `settings.project.passwordPolicies.${policy}.label`,
                                                            )}
                                                        </span>
                                                        <span className="text-xs font-normal whitespace-normal text-muted-foreground">
                                                            {t(
                                                                `settings.project.passwordPolicies.${policy}.description`,
                                                            )}
                                                        </span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                        {passwordPolicies.map((policy) => (
                                            <li key={`hint-${policy}`}>
                                                <span className="font-medium text-foreground">
                                                    {t(
                                                        `settings.project.passwordPolicies.${policy}.label`,
                                                    )}
                                                    :
                                                </span>{' '}
                                                {t(
                                                    `settings.project.passwordPolicies.${policy}.description`,
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    <InputError
                                        message={errors.password_policy}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="login_max_attempts">
                                        {t('settings.project.loginMaxAttempts')}
                                    </Label>
                                    <Input
                                        id="login_max_attempts"
                                        name="login_max_attempts"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={form.login_max_attempts}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                login_max_attempts: Number(
                                                    event.target.value,
                                                ),
                                            }))
                                        }
                                    />
                                    <InputError
                                        message={errors.login_max_attempts}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            id="two_factor_required"
                                            checked={form.two_factor_required}
                                            onCheckedChange={(checked) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    two_factor_required:
                                                        checked === true,
                                                }))
                                            }
                                        />
                                        <Label htmlFor="two_factor_required">
                                            {t(
                                                'settings.project.twoFactorRequired',
                                            )}
                                        </Label>
                                    </div>
                                    <p className="pl-7 text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.twoFactorRequiredHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.two_factor_required}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.registrationTitle',
                                    )}
                                    description={t(
                                        'settings.project.registrationDescription',
                                    )}
                                />

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="registration_enabled"
                                        checked={form.registration_enabled}
                                        onCheckedChange={(checked) =>
                                            setForm((current) => ({
                                                ...current,
                                                registration_enabled:
                                                    checked === true,
                                            }))
                                        }
                                    />
                                    <Label htmlFor="registration_enabled">
                                        {t(
                                            'settings.project.registrationEnabled',
                                        )}
                                    </Label>
                                </div>
                                <InputError
                                    message={errors.registration_enabled}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="default_user_role">
                                        {t('settings.project.defaultUserRole')}
                                    </Label>
                                    <Select
                                        value={
                                            form.default_user_role || '__none__'
                                        }
                                        onValueChange={(value) =>
                                            setForm((current) => ({
                                                ...current,
                                                default_user_role:
                                                    value === '__none__'
                                                        ? ''
                                                        : value,
                                            }))
                                        }
                                    >
                                        <SelectTrigger
                                            id="default_user_role"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">
                                                {t('settings.project.noRole')}
                                            </SelectItem>
                                            {roles.map((role) => (
                                                <SelectItem
                                                    key={role.id}
                                                    value={role.name}
                                                >
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <InputError
                                        message={errors.default_user_role}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="email_verification_required"
                                        checked={
                                            form.email_verification_required
                                        }
                                        onCheckedChange={(checked) =>
                                            setForm((current) => ({
                                                ...current,
                                                email_verification_required:
                                                    checked === true,
                                            }))
                                        }
                                    />
                                    <Label htmlFor="email_verification_required">
                                        {t(
                                            'settings.project.emailVerificationRequired',
                                        )}
                                    </Label>
                                </div>
                                <InputError
                                    message={errors.email_verification_required}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="allowed_domains">
                                        {t('settings.project.allowedDomains')}
                                    </Label>
                                    <Textarea
                                        id="allowed_domains"
                                        name="allowed_domains"
                                        value={form.allowed_domains}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                allowed_domains:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder="example.com, company.org"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.allowedDomainsHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.allowed_domains}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.publicApiTitle')}
                                    description={t(
                                        'settings.project.publicApiDescription',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="public_api_allowed_origins">
                                        {t(
                                            'settings.project.publicApiAllowedOrigins',
                                        )}
                                    </Label>
                                    <Textarea
                                        id="public_api_allowed_origins"
                                        name="public_api_allowed_origins"
                                        value={form.public_api_allowed_origins}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                public_api_allowed_origins:
                                                    event.target.value,
                                            }))
                                        }
                                        placeholder={
                                            'https://www.example.com\nhttps://app.example.com'
                                        }
                                        rows={4}
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.publicApiAllowedOriginsHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={
                                            errors.public_api_allowed_origins ??
                                            errors[
                                                'public_api_allowed_origins.0'
                                            ]
                                        }
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.filesTitle')}
                                    description={t(
                                        'settings.project.filesDescription',
                                    )}
                                />

                                <div className="space-y-2">
                                    <Label>
                                        {t(
                                            'settings.project.allowedTransformations',
                                        )}
                                    </Label>
                                    {transformationOptions.map((option) => (
                                        <div
                                            key={option}
                                            className="flex items-center gap-3"
                                        >
                                            <Checkbox
                                                id={`transform-${option}`}
                                                checked={form.allowed_transformations.includes(
                                                    option,
                                                )}
                                                onCheckedChange={(checked) =>
                                                    setForm((current) => {
                                                        const next =
                                                            checked === true
                                                                ? [
                                                                      ...current.allowed_transformations,
                                                                      option,
                                                                  ]
                                                                : current.allowed_transformations.filter(
                                                                      (entry) =>
                                                                          entry !==
                                                                          option,
                                                                  );

                                                        return {
                                                            ...current,
                                                            allowed_transformations:
                                                                next,
                                                        };
                                                    })
                                                }
                                            />
                                            <Label
                                                htmlFor={`transform-${option}`}
                                            >
                                                {t(
                                                    `settings.project.transformations.${option}`,
                                                    {
                                                        defaultValue: option,
                                                    },
                                                )}
                                            </Label>
                                        </div>
                                    ))}
                                    <InputError
                                        message={errors.allowed_transformations}
                                    />
                                </div>

                                <TransformPresetsField
                                    presets={form.preset_transformations}
                                    fits={transformFits}
                                    formats={transformFormats}
                                    error={presetTransformErrors(errors)}
                                    onChange={(presets) =>
                                        setForm((current) => ({
                                            ...current,
                                            preset_transformations: presets,
                                        }))
                                    }
                                />
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.reportingTitle')}
                                    description={t(
                                        'settings.project.reportingDescription',
                                    )}
                                />

                                {(
                                    [
                                        [
                                            'report_issue_url',
                                            t(
                                                'settings.project.reportIssueUrl',
                                            ),
                                        ],
                                        [
                                            'report_bug_url',
                                            t('settings.project.reportBugUrl'),
                                        ],
                                        [
                                            'report_error_url',
                                            t(
                                                'settings.project.reportErrorUrl',
                                            ),
                                        ],
                                    ] as const
                                ).map(([field, label]) => (
                                    <div key={field} className="grid gap-2">
                                        <Label htmlFor={field}>{label}</Label>
                                        <Input
                                            id={field}
                                            name={field}
                                            type="url"
                                            value={form[field]}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    [field]: event.target.value,
                                                }))
                                            }
                                        />
                                        <InputError message={errors[field]} />
                                    </div>
                                ))}
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('settings.project.webhooksTitle')}
                                    description={t(
                                        'settings.project.webhooksDescription',
                                    )}
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="webhook_url">
                                        {t('settings.project.webhookUrl')}
                                    </Label>
                                    <Input
                                        id="webhook_url"
                                        name="webhook_url"
                                        type="url"
                                        autoComplete="off"
                                        data-1p-ignore
                                        data-lpignore="true"
                                        value={form.webhook_url}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                webhook_url: event.target.value,
                                            }))
                                        }
                                        placeholder="https://example.com/webhooks/externa"
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t('settings.project.webhookUrlHint')}
                                    </p>
                                    <InputError message={errors.webhook_url} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="webhook_secret">
                                        {t('settings.project.webhookSecret')}
                                    </Label>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <Input
                                            id="webhook_secret"
                                            name="webhook_secret"
                                            type="password"
                                            autoComplete="new-password"
                                            value={form.webhook_secret}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    webhook_secret:
                                                        event.target.value,
                                                }))
                                            }
                                            placeholder={
                                                project.webhook_secret_configured
                                                    ? '••••••••'
                                                    : undefined
                                            }
                                            className="sm:flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={generateWebhookSecret}
                                        >
                                            {t(
                                                'settings.project.webhookSecretGenerate',
                                            )}
                                        </Button>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {project.webhook_secret_configured
                                            ? t(
                                                  'settings.project.webhookSecretConfigured',
                                              )
                                            : null}{' '}
                                        {t(
                                            'settings.project.webhookSecretHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.webhook_secret}
                                    />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={
                                            sendingTestWebhook ||
                                            !project.webhook_url
                                        }
                                        onClick={sendTestWebhook}
                                        data-test="project-webhook-test"
                                    >
                                        {t('settings.project.webhookSendTest')}
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'settings.project.webhookSendTestHint',
                                        )}
                                    </p>
                                </div>
                            </div>

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}
