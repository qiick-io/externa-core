import { Form, Head } from '@inertiajs/react';
import { useMemo } from 'react';
import type {} from 'react';
import { useTranslation } from 'react-i18next';
import ProjectFilesSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectFilesSettingsController';
import Heading from '@/components/heading';
import { TransformPresetsField } from '@/components/settings/transform-presets-field';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useSettingsFormState } from '@/hooks/use-settings-form-state';
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
    | 'upload_allowed_mimes'
    | 'upload_allowed_extensions'
    | 'upload_allow_svg'
>;

type Props = {
    project: FilesProjectSettings;
    transformationOptions: string[];
    transformFits: TransformPreset['fit'][];
    transformFormats: TransformPreset['format'][];
    defaultUploadMimes: string[];
};

function buildFormState(project: FilesProjectSettings) {
    return {
        files_max_upload_bytes: project.files_max_upload_bytes ?? null,
        chat_max_upload_bytes: project.chat_max_upload_bytes ?? null,
        allowed_transformations: project.allowed_transformations ?? [],
        preset_transformations: project.preset_transformations ?? [],
        upload_allowed_mimes_text: (project.upload_allowed_mimes ?? []).join(
            ', ',
        ),
        upload_allowed_extensions_text: (
            project.upload_allowed_extensions ?? []
        ).join(', '),
        upload_allow_svg: project.upload_allow_svg ?? false,
    };
}

function splitList(value: string): string[] {
    return value
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
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
    defaultUploadMimes,
}: Props) {
    const { t } = useTranslation();
    const initialForm = useMemo(() => buildFormState(project), [project]);
    const { form, setForm, isDirty, markSaved } =
        useSettingsFormState(initialForm);

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
                    className="space-y-12"
                    onSuccess={markSaved}
                    noValidate
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
                            <input
                                type="hidden"
                                name="upload_allowed_mimes"
                                value={JSON.stringify(
                                    splitList(form.upload_allowed_mimes_text),
                                )}
                            />
                            <input
                                type="hidden"
                                name="upload_allowed_extensions"
                                value={JSON.stringify(
                                    splitList(
                                        form.upload_allowed_extensions_text,
                                    ),
                                )}
                            />
                            <input
                                type="hidden"
                                name="upload_allow_svg"
                                value={form.upload_allow_svg ? '1' : '0'}
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

                                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                    <Field
                                        data-invalid={
                                            errors.files_max_upload_bytes
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="files_max_upload_mb">
                                            {t(
                                                'settings.project.filesMaxUploadMb',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.files_max_upload_bytes
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.files_max_upload_bytes
                                                    ? 'files-max-upload-bytes-error'
                                                    : undefined
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
                                        <FieldError id="files-max-upload-bytes-error">
                                            {errors.files_max_upload_bytes}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={
                                            errors.chat_max_upload_bytes
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="chat_max_upload_mb">
                                            {t(
                                                'settings.project.chatMaxUploadMb',
                                            )}
                                        </FieldLabel>
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
                                            aria-invalid={
                                                errors.chat_max_upload_bytes
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.chat_max_upload_bytes
                                                    ? 'chat-max-upload-bytes-error'
                                                    : undefined
                                            }
                                        />
                                        <input
                                            type="hidden"
                                            name="chat_max_upload_bytes"
                                            value={
                                                form.chat_max_upload_bytes ?? ''
                                            }
                                        />
                                        <FieldError id="chat-max-upload-bytes-error">
                                            {errors.chat_max_upload_bytes}
                                        </FieldError>
                                    </Field>
                                </FieldGroup>
                                <p className="text-sm text-muted-foreground">
                                    {t('settings.project.uploadLimitsHint')}
                                </p>
                            </div>

                            <Separator />

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.uploadPolicyTitle',
                                    )}
                                    description={t(
                                        'settings.project.uploadPolicyDescription',
                                    )}
                                />

                                <FieldGroup className="gap-6">
                                    <Field
                                        data-invalid={
                                            errors.upload_allowed_extensions
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="upload_allowed_extensions">
                                            {t(
                                                'settings.project.uploadAllowedExtensions',
                                            )}
                                        </FieldLabel>
                                        <Input
                                            id="upload_allowed_extensions"
                                            value={
                                                form.upload_allowed_extensions_text
                                            }
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    upload_allowed_extensions_text:
                                                        event.target.value,
                                                }))
                                            }
                                            placeholder="png, jpg, pdf"
                                            aria-invalid={
                                                errors.upload_allowed_extensions
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.upload_allowed_extensions
                                                    ? 'upload-allowed-extensions-error'
                                                    : 'upload-allowed-extensions-hint'
                                            }
                                        />
                                        <FieldDescription id="upload-allowed-extensions-hint">
                                            {t(
                                                'settings.project.uploadAllowedExtensionsHelp',
                                            )}
                                        </FieldDescription>
                                        <FieldError id="upload-allowed-extensions-error">
                                            {errors.upload_allowed_extensions}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        data-invalid={
                                            errors.upload_allowed_mimes
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <FieldLabel htmlFor="upload_allowed_mimes">
                                            {t(
                                                'settings.project.uploadAllowedMimes',
                                            )}
                                        </FieldLabel>
                                        <Input
                                            id="upload_allowed_mimes"
                                            value={
                                                form.upload_allowed_mimes_text
                                            }
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    upload_allowed_mimes_text:
                                                        event.target.value,
                                                }))
                                            }
                                            placeholder={defaultUploadMimes
                                                .slice(0, 4)
                                                .join(', ')}
                                            aria-invalid={
                                                errors.upload_allowed_mimes
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.upload_allowed_mimes
                                                    ? 'upload-allowed-mimes-error'
                                                    : 'upload-allowed-mimes-hint'
                                            }
                                        />
                                        <FieldDescription id="upload-allowed-mimes-hint">
                                            {t(
                                                'settings.project.uploadAllowedMimesHelp',
                                            )}
                                        </FieldDescription>
                                        <FieldError id="upload-allowed-mimes-error">
                                            {errors.upload_allowed_mimes}
                                        </FieldError>
                                    </Field>

                                    <Field
                                        orientation="horizontal"
                                        data-invalid={
                                            errors.upload_allow_svg
                                                ? true
                                                : undefined
                                        }
                                    >
                                        <Checkbox
                                            id="upload_allow_svg"
                                            checked={form.upload_allow_svg}
                                            onCheckedChange={(checked) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    upload_allow_svg:
                                                        checked === true,
                                                }))
                                            }
                                            aria-invalid={
                                                errors.upload_allow_svg
                                                    ? true
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.upload_allow_svg
                                                    ? 'upload-allow-svg-error'
                                                    : 'upload-allow-svg-hint'
                                            }
                                        />
                                        <div className="grid gap-1">
                                            <FieldLabel
                                                htmlFor="upload_allow_svg"
                                                className="font-normal"
                                            >
                                                {t(
                                                    'settings.project.uploadAllowSvg',
                                                )}
                                            </FieldLabel>
                                            <FieldDescription id="upload-allow-svg-hint">
                                                {t(
                                                    'settings.project.uploadAllowSvgHelp',
                                                )}
                                            </FieldDescription>
                                            <FieldError id="upload-allow-svg-error">
                                                {errors.upload_allow_svg}
                                            </FieldError>
                                        </div>
                                    </Field>
                                </FieldGroup>

                                <p className="text-sm text-muted-foreground">
                                    {t(
                                        'settings.project.uploadPolicyFloorHint',
                                    )}
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

                                <Field
                                    data-invalid={
                                        errors.allowed_transformations
                                            ? true
                                            : undefined
                                    }
                                >
                                    <FieldLabel>
                                        {t(
                                            'settings.project.allowedTransformations',
                                        )}
                                    </FieldLabel>
                                    <div className="space-y-2">
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
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        setForm((current) => {
                                                            const next =
                                                                checked === true
                                                                    ? [
                                                                          ...current.allowed_transformations,
                                                                          option,
                                                                      ]
                                                                    : current.allowed_transformations.filter(
                                                                          (
                                                                              entry,
                                                                          ) =>
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
                                                <FieldLabel
                                                    htmlFor={`transform-${option}`}
                                                    className="font-normal"
                                                >
                                                    {t(
                                                        `settings.project.transformations.${option}`,
                                                        {
                                                            defaultValue:
                                                                option,
                                                        },
                                                    )}
                                                </FieldLabel>
                                            </div>
                                        ))}
                                    </div>
                                    <FieldError id="allowed-transformations-error">
                                        {errors.allowed_transformations}
                                    </FieldError>
                                </Field>

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
