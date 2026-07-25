/** Follow-up prompt chip shown after an AI tool completes. */
export type AiSuggestedAction = {
    label: string;
    prompt: string;
};

const suggestionsByTool: Record<string, AiSuggestedAction[]> = {
    ImportCollectionCsv: [
        {
            label: 'Verify import',
            prompt: 'Verify the latest imported items.',
        },
        { label: 'Export CSV', prompt: 'Export this collection as CSV.' },
    ],
    ImportRemoteJson: [
        {
            label: 'Schedule sync',
            prompt: 'Schedule periodic sync for this source.',
        },
        {
            label: 'Verify import',
            prompt: 'Verify the latest imported items.',
        },
    ],
    ManageCollections: [
        {
            label: 'Add fields',
            prompt: 'Suggest and add missing fields to the collection.',
        },
        {
            label: 'Show items',
            prompt: 'Show items in this collection.',
        },
    ],
    ManageCollectionItems: [
        { label: 'Show items', prompt: 'Show the updated items.' },
        { label: 'Export JSON', prompt: 'Export this collection as JSON.' },
    ],
    QueryActivityLogs: [
        {
            label: 'Recent activity',
            prompt: 'Show recent activity with QueryActivityLogs.',
        },
        {
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
