import { Form, Head } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectLocalizationSettingsController from '@/actions/App/Http/Controllers/Settings/ProjectLocalizationSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { ContentLocalesField } from '@/components/settings/content-locales-field';
import { SettingsFormActions } from '@/components/settings-form-actions';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import type { ContentLocaleCatalogEntry } from '@/lib/content-locales-catalog';
import { edit as editLocalization } from '@/routes/project/localization';
import type { BreadcrumbItem, ProjectSettingsForm } from '@/types';

type LocalizationProjectSettings = Pick<
    ProjectSettingsForm,
    | 'default_language'
    | 'content_locales'
    | 'default_content_locale'
    | 'fallback_content_locales'
>;

type Props = {
    project: LocalizationProjectSettings;
    availableLocales: Record<string, string>;
    contentLocaleCatalog: ContentLocaleCatalogEntry[];
};

function buildFormState(project: LocalizationProjectSettings) {
    return {
        default_language: project.default_language,
        content_locales: project.content_locales ?? ['en', 'it'],
        default_content_locale:
            project.default_content_locale ??
            project.content_locales?.[0] ??
            'en',
        fallback_content_locales: project.fallback_content_locales ??
            project.content_locales ?? ['en', 'it'],
    };
}

/**
 * Localization project settings (admin UI language + content locales).
 */
export default function ProjectLocalizationSettingsPage({
    project,
    availableLocales,
    contentLocaleCatalog,
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
            title: t('settings.project.localization.breadcrumb'),
            href: editLocalization(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.project.localization.head')} />

            <h1 className="sr-only">
                {t('settings.project.localization.head')}
            </h1>

            <SettingsLayout>
                <Form
                    {...ProjectLocalizationSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-10"
                    onSuccess={() => setIsDirty(false)}
                >
                    {({ processing, recentlySuccessful, errors }) => (
                        <>
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

                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.project.localization.title',
                                    )}
                                    description={t(
                                        'settings.project.localization.description',
                                    )}
                                />

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

                            <SettingsFormActions
                                processing={processing}
                                recentlySuccessful={recentlySuccessful}
                                isDirty={isDirty}
                                data-test="project-localization-settings-save"
                            />
                        </>
                    )}
                </Form>
            </SettingsLayout>
        </AppLayout>
    );
}
