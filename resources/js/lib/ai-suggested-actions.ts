/** Follow-up prompt chip shown after an AI tool completes. */
export type AiSuggestedAction = {
    /** Locale key under `ai.suggestedActions.*`. */
    id: string;
    /** English fallback label; the chat localizes via `id`. */
    label: string;
    prompt: string;
};

const suggestionsByTool: Record<string, AiSuggestedAction[]> = {
    ImportCollectionCsv: [
        {
            id: 'verifyImport',
            label: 'Verify import',
            prompt: 'Verify the latest imported items.',
        },
        {
            id: 'exportCsv',
            label: 'Export CSV',
            prompt: 'Export this collection as CSV.',
        },
    ],
    ImportRemoteJson: [
        {
            id: 'scheduleSync',
            label: 'Schedule sync',
            prompt: 'Schedule periodic sync for this source.',
        },
        {
            id: 'verifyImport',
            label: 'Verify import',
            prompt: 'Verify the latest imported items.',
        },
    ],
    ManageCollections: [
        {
            id: 'addFields',
            label: 'Add fields',
            prompt: 'Suggest and add missing fields to the collection.',
        },
        {
            id: 'showItems',
            label: 'Show items',
            prompt: 'Show items in this collection.',
        },
    ],
    ManageCollectionItems: [
        {
            id: 'showItems',
            label: 'Show items',
            prompt: 'Show the updated items.',
        },
        {
            id: 'exportJson',
            label: 'Export JSON',
            prompt: 'Export this collection as JSON.',
        },
    ],
    QueryActivityLogs: [
        {
            id: 'recentActivity',
            label: 'Recent activity',
            prompt: 'Show recent activity with QueryActivityLogs.',
        },
        {
            id: 'aiOnly',
            label: 'AI only',
            prompt: 'Use QueryActivityLogs with log_name=ai and summarize recent AI events.',
        },
    ],
};

/**
 * Returns suggested follow-up actions for the most recently used AI tool in the list.
 * Walks `toolNames` from last to first and returns the first matching preset set.
 *
 * @param toolNames - Tool names invoked in the current turn, oldest to newest
 * @returns Matching suggestions, or an empty array when none apply
 */
export function suggestedActionsForTools(
    toolNames: string[],
): AiSuggestedAction[] {
    for (let index = toolNames.length - 1; index >= 0; index--) {
        const suggestions = suggestionsByTool[toolNames[index] ?? ''];

        if (suggestions) {
            return suggestions;
        }
    }

    return [];
}
