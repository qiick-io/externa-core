import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsFormState } from '@/hooks/use-settings-form-state';
import { UnsavedChangesContext } from '@/hooks/use-unsaved-changes';
import type { UnsavedChangesContextValue } from '@/hooks/use-unsaved-changes';

type Registration = Parameters<UnsavedChangesContextValue['register']>[0];

function renderSettingsForm() {
    const registrations: Registration[] = [];
    const context: UnsavedChangesContextValue = {
        requestLeave: vi.fn(async () => true),
        requestDiscard: vi.fn(async () => true),
        hasUnsavedChanges: false,
        register: (options) => {
            registrations.push(options);

            return () => undefined;
        },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
        <UnsavedChangesContext.Provider value={context}>
            {children}
        </UnsavedChangesContext.Provider>
    );
    const hook = renderHook(() => useSettingsFormState({ name: 'Externa' }), {
        wrapper,
    });

    return { hook, registrations };
}

describe('useSettingsFormState', () => {
    it('marks the page dirty on edit and clean after a save', () => {
        const { hook, registrations } = renderSettingsForm();

        expect(hook.result.current.isDirty).toBe(false);

        act(() => hook.result.current.setForm({ name: 'Renamed' }));
        expect(hook.result.current.form.name).toBe('Renamed');
        expect(hook.result.current.isDirty).toBe(true);
        expect(registrations.at(-1)?.isDirty()).toBe(true);

        act(() => hook.result.current.markSaved());
        expect(hook.result.current.isDirty).toBe(false);
        expect(hook.result.current.form.name).toBe('Renamed');
    });

    it('restores the initial form when the guard discards', () => {
        const { hook, registrations } = renderSettingsForm();

        act(() => hook.result.current.setForm({ name: 'Draft' }));
        act(() => registrations.at(-1)?.onDiscard?.());

        expect(hook.result.current.form.name).toBe('Externa');
        expect(hook.result.current.isDirty).toBe(false);
    });
});
