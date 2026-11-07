import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { resolveFileActions } from '@/components/admin/files/file-actions';
import type { FileActionPermissions } from '@/components/admin/files/file-actions';
import type { AdminFileRow } from '@/types/files';

const t = ((key: string) => key) as unknown as TFunction;

const file = {
    id: 1,
    type: 'file',
    is_favorited: false,
} as AdminFileRow;

const permissions: FileActionPermissions = {
    canEdit: false,
    canDelete: false,
    canRestore: false,
    canForceDelete: false,
    canDownload: false,
    canFavorite: false,
    canCopy: false,
    canReplace: false,
    canTag: false,
    canUpdateMetadata: false,
    canUseAi: true,
};

function askAiAction(isAiAvailable: boolean | undefined) {
    return resolveFileActions(
        [file],
        { ...permissions, isAiAvailable },
        false,
        t,
    ).find((action) => action.key === 'ask_ai');
}

describe('resolveFileActions Ask AI availability', () => {
    it('disables Ask AI with the FAB offline reason while AI is offline', () => {
        expect(askAiAction(false)?.disabledReason).toBe('ai.aiOfflineHint');
    });

    it('enables Ask AI while AI is online', () => {
        expect(askAiAction(true)).toBeDefined();
        expect(askAiAction(true)?.disabledReason).toBeUndefined();
    });

    it('hides Ask AI without CanUseAi', () => {
        expect(
            resolveFileActions(
                [file],
                { ...permissions, canUseAi: false, isAiAvailable: true },
                false,
                t,
            ).some((action) => action.key === 'ask_ai'),
        ).toBe(false);
    });
});
