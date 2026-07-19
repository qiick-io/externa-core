/** Follow-up prompt chip shown after an AI tool completes. */
export type AiSuggestedAction = {
    label: string;
    prompt: string;
};

const suggestionsByTool: Record<string, AiSuggestedAction[]> = {
    ImportCollectionCsv: [
        {
            label: 'Verifica import',
            prompt: 'Verifica gli ultimi elementi importati.',
        },
        { label: 'Esporta CSV', prompt: 'Esporta questa collezione in CSV.' },
    ],
    ImportRemoteJson: [
        {
            label: 'Programma sync',
            prompt: 'Programma la sincronizzazione periodica di questa sorgente.',
        },
        {
            label: 'Verifica import',
            prompt: 'Verifica gli ultimi elementi importati.',
        },
    ],
    ManageCollections: [
        {
            label: 'Aggiungi campi',
            prompt: 'Suggerisci e aggiungi i campi mancanti alla collezione.',
        },
        {
            label: 'Mostra elementi',
            prompt: 'Mostra gli elementi di questa collezione.',
        },
    ],
    ManageCollectionItems: [
        { label: 'Mostra elementi', prompt: 'Mostra gli elementi aggiornati.' },
        { label: 'Esporta JSON', prompt: 'Esporta questa collezione in JSON.' },
    ],
    QueryActivityLogs: [
        {
            label: 'Attività recenti',
            prompt: 'Mostra le attività recenti con QueryActivityLogs.',
        },
        {
            label: 'Solo AI',
            prompt: 'Usa QueryActivityLogs con log_name=ai e riassumimi gli eventi AI recenti.',
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
