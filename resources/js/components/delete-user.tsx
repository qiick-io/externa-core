import { Form } from '@inertiajs/react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import Heading from '@/components/heading';
import PasswordInput from '@/components/password-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';

/**
 * Account deletion confirmation flow in settings.
 */
export default function DeleteUser() {
    const { t } = useTranslation();
    const passwordInput = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.deleteUser.title')}
                description={t('settings.deleteUser.description')}
            />
            <div className="space-y-4">
                <Alert variant="destructive">
                    <AlertTitle>{t('settings.deleteUser.warning')}</AlertTitle>
                    <AlertDescription>
                        {t('settings.deleteUser.caution')}
                    </AlertDescription>
                </Alert>

                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="destructive"
                            data-test="delete-user-button"
                        >
                            {t('settings.deleteUser.button')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>
                            {t('settings.deleteUser.confirmTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('settings.deleteUser.confirmDescription')}
                        </DialogDescription>

                        <Form
                            {...wayfinderInertiaFormProps(
                                ProfileController.destroy,
                                undefined,
                                'delete',
                            )}
                            options={{
                                preserveScroll: true,
                            }}
                            onError={() => passwordInput.current?.focus()}
                            resetOnSuccess
                            className="space-y-6"
                            noValidate
                        >
                            {({ resetAndClearErrors, processing, errors }) => (
                                <>
                                    <FieldGroup>
                                        <Field
                                            data-invalid={
                                                errors.password
                                                    ? true
                                                    : undefined
                                            }
                                        >
                                            <FieldLabel
                                                htmlFor="password"
                                                className="sr-only"
                                            >
                                                {t('common.password')}
                                            </FieldLabel>

                                            <PasswordInput
                                                id="password"
                                                name="password"
                                                ref={passwordInput}
                                                placeholder={t(
                                                    'common.password',
                                                )}
                                                autoComplete="current-password"
                                                aria-invalid={
                                                    errors.password
                                                        ? true
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.password
                                                        ? 'delete-user-password-error'
                                                        : undefined
                                                }
                                            />

                                            <FieldError id="delete-user-password-error">
                                                {errors.password}
                                            </FieldError>
                                        </Field>
                                    </FieldGroup>

                                    <DialogFooter className="gap-2">
                                        <DialogClose asChild>
                                            <Button
                                                variant="secondary"
                                                onClick={() =>
                                                    resetAndClearErrors()
                                                }
                                            >
                                                {t('common.cancel')}
                                            </Button>
                                        </DialogClose>

                                        <Button
                                            variant="destructive"
                                            disabled={processing}
                                            asChild
                                        >
                                            <button
                                                type="submit"
                                                data-test="confirm-delete-user-button"
                                            >
                                                {t(
                                                    'settings.deleteUser.button',
                                                )}
                                            </button>
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
