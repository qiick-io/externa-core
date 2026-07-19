import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Form, Head } from '@inertiajs/react';
import { GripVertical, Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { TransformPresetsField } from '@/components/settings/transform-presets-field';
import { SettingsFormActions } from '@/components/settings-form-actions';
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
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
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
    passwordPolicies: Array<'weak' | 'medium' | 'strong'>;
    transformationOptions: string[];
    transformFits: TransformPreset['fit'][];
    transformFormats: TransformPreset['format'][];
};

/** Matches config('settings.project.sidebar_pinned_module_ids'). */
const PINNED_SIDEBAR_MODULE_IDS = new Set(['ai']);

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
                    className="text-muted-foreground/40 flex size-4 items-center justify-center"
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
                className={cn('flex-1', module.locked && 'text-muted-foreground')}
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
        <div className="bg-muted/30 flex items-center gap-3 rounded-md border px-3 py-2">
            <ModuleRowContent
                module={module}
                label={label}
                onToggle={onToggle}
            />
        </div>
    );
}

function SortableModuleRow({
    module,
    label,
    onToggle,
}: {
    module: SidebarModuleSetting;
    label: string;
    onToggle: (enabled: boolean) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: module.id });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2',
                isDragging && 'bg-muted opacity-80',
            )}
        >
            <ModuleRowContent
                module={module}
                label={label}
                onToggle={onToggle}
                dragHandle={
                    <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
                        aria-label="Reorder"
                        {...attributes}
                        {...listeners}
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
    passwordPolicies,
    transformationOptions,
    transformFits,
    transformFormats,
}: Props) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        ...project,
        name: project.name ?? '',
        description: project.description ?? '',
        url: project.url ?? '',
        default_user_role: project.default_user_role ?? '',
        allowed_domains: (project.allowed_domains ?? []).join(', '),
        preset_transformations: project.preset_transformations ?? [],
        report_issue_url: project.report_issue_url ?? '',
        report_bug_url: project.report_bug_url ?? '',
        report_error_url: project.report_error_url ?? '',
        sidebar_modules: pinSidebarModules(project.sidebar_modules),
        allowed_transformations: project.allowed_transformations ?? [],
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.project.breadcrumb'),
            href: editProject(),
        },
    ];

    const onDragEnd = (event: DragEndEvent): void => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            return;
        }

        if (
            PINNED_SIDEBAR_MODULE_IDS.has(String(active.id)) ||
            PINNED_SIDEBAR_MODULE_IDS.has(String(over.id))
        ) {
            return;
        }

        setForm((current) => {
            const oldIndex = current.sidebar_modules.findIndex(
                (module) => module.id === active.id,
            );
            const newIndex = current.sidebar_modules.findIndex(
                (module) => module.id === over.id,
            );

            if (oldIndex < 0 || newIndex < 0) {
                return current;
            }

            return {
                ...current,
                sidebar_modules: pinSidebarModules(
                    arrayMove(
                        current.sidebar_modules,
                        oldIndex,
                        newIndex,
                    ),
                ),
            };
        });
    };

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

    const toggleModule = (moduleId: string, enabled: boolean): void => {
        setForm((current) => ({
            ...current,
            sidebar_modules: current.sidebar_modules.map((entry) =>
                entry.id === moduleId ? { ...entry, enabled } : entry,
            ),
        }));
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
                                value={JSON.stringify(form.allowed_transformations)}
                            />
                            <input
                                type="hidden"
                                name="preset_transformations"
                                value={JSON.stringify(form.preset_transformations)}
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
                                name="default_language"
                                value={form.default_language}
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
                                            {Object.entries(availableLocales).map(
                                                ([code, label]) => (
                                                    <SelectItem
                                                        key={code}
                                                        value={code}
                                                    >
                                                        {label}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <InputError
                                        message={errors.default_language}
                                    />
                                </div>
                            </div>

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
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={onDragEnd}
                                    >
                                        <SortableContext
                                            items={sortableModules.map(
                                                (module) => module.id,
                                            )}
                                            strategy={
                                                verticalListSortingStrategy
                                            }
                                        >
                                            <div className="space-y-2">
                                                {sortableModules.map(
                                                    (module) => (
                                                        <SortableModuleRow
                                                            key={module.id}
                                                            module={module}
                                                            label={moduleLabel(
                                                                module.id,
                                                            )}
                                                            onToggle={(
                                                                enabled,
                                                            ) =>
                                                                toggleModule(
                                                                    module.id,
                                                                    enabled,
                                                                )
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </div>
                                        </SortableContext>
                                    </DndContext>
                                </div>
                                <InputError message={errors.sidebar_modules} />
                            </div>

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
                                                        <span className="text-muted-foreground text-xs font-normal whitespace-normal">
                                                            {t(
                                                                `settings.project.passwordPolicies.${policy}.description`,
                                                            )}
                                                        </span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                                        {passwordPolicies.map((policy) => (
                                            <li key={`hint-${policy}`}>
                                                <span className="text-foreground font-medium">
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
                            </div>

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
                                        value={form.default_user_role || '__none__'}
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
                                    message={
                                        errors.email_verification_required
                                    }
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
                                    <p className="text-muted-foreground text-sm">
                                        {t(
                                            'settings.project.allowedDomainsHint',
                                        )}
                                    </p>
                                    <InputError
                                        message={errors.allowed_domains}
                                    />
                                </div>
                            </div>

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
                                        message={
                                            errors.allowed_transformations
                                        }
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
                                            t('settings.project.reportIssueUrl'),
                                        ],
                                        [
                                            'report_bug_url',
                                            t('settings.project.reportBugUrl'),
                                        ],
                                        [
                                            'report_error_url',
                                            t('settings.project.reportErrorUrl'),
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

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                data-test="project-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}
