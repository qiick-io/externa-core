import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';

/**
 * Local form state for a project settings page (`pages/settings/project*`)
 * that posts through Inertia `<Form>`: every `setForm` marks the page dirty,
 * the page registers with the unsaved-changes guard (Discard restores
 * `initialForm`), and `markSaved` clears the flag after a successful save.
 *
 * @param initialForm - Form state built from the server props
 * @returns The current form, its setter and `markSaved` for `onSuccess`
 */
export function useSettingsFormState<T>(initialForm: T): {
    form: T;
    setForm: Dispatch<SetStateAction<T>>;
    isDirty: boolean;
    markSaved: () => void;
} {
    const [form, setFormState] = useState<T>(initialForm);
    const [isDirty, setIsDirty] = useState(false);

    const setForm: Dispatch<SetStateAction<T>> = (action) => {
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

    return { form, setForm, isDirty, markSaved: () => setIsDirty(false) };
}
