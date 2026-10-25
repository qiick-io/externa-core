import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectFilesSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectFilesSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { TransformPresetsField } from '@/components/settings/transform-presets-field';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editFiles } from '@/routes/project/files';
import type {
    BreadcrumbItem,
    ProjectSettingsForm,
    TransformPreset,
} from '@/types';

type FilesProjectSettings = Pick<
    ProjectSettingsForm,
    | 'files_max_upload_bytes'
    | 'chat_max_upload_bytes'
    | 'allowed_transformations'
    | 'preset_transformations'
>;

type Props = {
    project: FilesProjectSettings;
    transformationOptions: string[];
    transformFits: TransformPreset['fit'][];
    transformFormats: TransformPreset['format'][];
};

function buildFormState(project: FilesProjectSettings) {
    return {
        files_max_upload_bytes: project.files_max_upload_bytes ?? null,
        chat_max_upload_bytes: project.chat_max_upload_bytes ?? null,
        allowed_transformations: project.allowed_transformations ?? [],
        preset_transformations: project.preset_transformations ?? [],
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

/**
 * Files & media project settings (upload limits + image transforms).
 */
export default function ProjectFilesSettingsPage({
    project,
    transformationOptions,
    transformFits,
    transformFormats,
}: Props) {
    const { t } = useTranslation();
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const [form, setFormState] = useState(initialForm);
    const [isDirty, setIsDirty] = useState(false);

    const setForm: Dispatch<SetStateAction<typeof initialForm>> = (action) => {
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

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.project.filesNav.breadcrumb'),
            href: editFiles(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.filesNav.head')} />

            <h1 className="sr-only">{t('settings.project.filesNav.head')}</h1>

            <SettingsLayout>
                <Form
                    {...ProjectFilesSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
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

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.uploadLimitsTitle',
                                    )}
                                    description={t(
                                        'settings.project.uploadLimitsDescription',
                                    )}
                                />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="files_max_upload_mb">
                                            {t(
                                                'settings.project.filesMaxUploadMb',
                                            )}
                                        </Label>
                                        <Input
                                            id="files_max_upload_mb"
                                            type="number"
                                            min={1}
                                            value={
                                                form.files_max_upload_bytes !=
                                                null
                                                    ? Math.round(
                                                          form.files_max_upload_bytes /
                                                              (1024 * 1024),
                                                      )
                                                    : ''
                                            }
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    files_max_upload_bytes:
                                                        event.target.value ===
                                                        ''
                                                            ? null
                                                            : Math.max(
                                                                  1,
                                                                  Number(
                                                                      event
                                                                          .target
                                                                          .value,
                                                                  ),
                                                              ) *
                                                              1024 *
                                                              1024,
                                                }))
                                            }
                                        />
                                        <input
                                            type="hidden"
                                            name="files_max_upload_bytes"
                                            value={
                                                form.files_max_upload_bytes ??
                                                ''
                                            }
                                        />
                                        <InputError
                                            message={
                                                errors.files_max_upload_bytes
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="chat_max_upload_mb">
                                            {t(
                                                'settings.project.chatMaxUploadMb',
                                            )}
                                        </Label>
                                        <Input
                                            id="chat_max_upload_mb"
                                            type="number"
                                            min={1}
                                            value={
                                                form.chat_max_upload_bytes !=
                                                null
                                                    ? Math.round(
                                                          form.chat_max_upload_bytes /
                                                              (1024 * 1024),
                                                      )
                                                    : ''
                                            }
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    chat_max_upload_bytes:
                                                        event.target.value ===
                                                        ''
                                                            ? null
                                                            : Math.max(
                                                                  1,
                                                                  Number(
                                                                      event
                                                                          .target
                                                                          .value,
                                                                  ),
                                                              ) *
                                                              1024 *
                                                              1024,
                                                }))
                                            }
                                        />
                                        <input
                                            type="hidden"
                                            name="chat_max_upload_bytes"
                                            value={
                                                form.chat_max_upload_bytes ?? ''
                                            }
                                        />
                                        <InputError
                                            message={
                                                errors.chat_max_upload_bytes
                                            }
                                        />
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {t('settings.project.uploadLimitsHint')}
                                </p>
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

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-files-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}
