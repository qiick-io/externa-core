import { jsonRequestHeaders } from '@/lib/csrf';

/** Collection option for the item attach picker. */
export type AiContextCollectionOption = {
    id: number;
    name: string;
    slug: string;
};

/** Collection item option for the attach picker. */
export type AiContextItemOption = {
    id: number;
    collection_id: number;
    collection_name: string;
    collection_slug: string;
    label: string;
};

/** File option for the attach picker. */
export type AiContextFileOption = {
    id: number;
    name: string;
    mime?: string | null;
    size?: number | null;
    type: string;
};

/** Saved project prompt option / CRUD payload. */
export type AiSavedPrompt = {
    id: number;
    name: string;
    description?: string | null;
    body: string;
    updated_at?: string | null;
};

/** Pending context chip shown in the composer before send. */
export type AiPendingContextAttachment =
    | {
          kind: 'item';
          id: number;
          name: string;
          collection_id: number;
          collection_name: string;
      }
    | {
          kind: 'file';
          id: number;
          name: string;
          mime?: string | null;
          size?: number | null;
      }
    | {
          kind: 'prompt';
          id: number;
          name: string;
      };

/**
 * Load collections the current user may read for the item attach picker.
 */
export async function fetchAiContextCollections(
    search = '',
): Promise<AiContextCollectionOption[]> {
    const params = new URLSearchParams();

    if (search.trim() !== '') {
        params.set('search', search.trim());
    }

    const response = await fetch(
        `/ai/context/collections${params.size > 0 ? `?${params}` : ''}`,
        {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        },
    );

    if (!response.ok) {
        throw new Error('Failed to load collections');
    }

    const payload = (await response.json()) as {
        collections: AiContextCollectionOption[];
    };

    return payload.collections ?? [];
}

/**
 * Search permission-filtered collection items for the attach picker.
 */
export async function fetchAiContextItems(options: {
    collectionId?: number | null;
    search?: string;
}): Promise<AiContextItemOption[]> {
    const params = new URLSearchParams();

    if (options.collectionId != null) {
        params.set('collection_id', String(options.collectionId));
    }

    if (options.search && options.search.trim() !== '') {
        params.set('search', options.search.trim());
    }

    const response = await fetch(
        `/ai/context/items${params.size > 0 ? `?${params}` : ''}`,
        {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        },
    );

    if (!response.ok) {
        throw new Error('Failed to load items');
    }

    const payload = (await response.json()) as { items: AiContextItemOption[] };

    return payload.items ?? [];
}

/**
 * Search files the current user may list for the attach picker.
 */
export async function fetchAiContextFiles(
    search = '',
): Promise<AiContextFileOption[]> {
    const params = new URLSearchParams();

    if (search.trim() !== '') {
        params.set('search', search.trim());
    }

    const response = await fetch(
        `/ai/context/files${params.size > 0 ? `?${params}` : ''}`,
        {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        },
    );

    if (!response.ok) {
        throw new Error('Failed to load files');
    }

    const payload = (await response.json()) as { files: AiContextFileOption[] };

    return payload.files ?? [];
}

/**
 * List project-level saved prompts and whether the user may manage them.
 */
export async function fetchAiSavedPrompts(
    search = '',
): Promise<{ prompts: AiSavedPrompt[]; canManage: boolean }> {
    const params = new URLSearchParams();

    if (search.trim() !== '') {
        params.set('search', search.trim());
    }

    const response = await fetch(
        `/ai/prompts${params.size > 0 ? `?${params}` : ''}`,
        {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        },
    );

    if (!response.ok) {
        throw new Error('Failed to load prompts');
    }

    const payload = (await response.json()) as {
        prompts: AiSavedPrompt[];
        can_manage: boolean;
    };

    return {
        prompts: payload.prompts ?? [],
        canManage: Boolean(payload.can_manage),
    };
}

/**
 * Create a saved project prompt (requires ai.prompts.manage).
 */
export async function createAiSavedPrompt(input: {
    name: string;
    description?: string;
    body: string;
}): Promise<AiSavedPrompt> {
    const response = await fetch('/ai/prompts', {
        method: 'POST',
        headers: {
            ...jsonRequestHeaders(),
            Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        throw new Error('Failed to create prompt');
    }

    const payload = (await response.json()) as { prompt: AiSavedPrompt };

    return payload.prompt;
}

/**
 * Update a saved project prompt (requires ai.prompts.manage).
 */
export async function updateAiSavedPrompt(
    promptId: number,
    input: { name: string; description?: string | null; body: string },
): Promise<AiSavedPrompt> {
    const response = await fetch(`/ai/prompts/${promptId}`, {
        method: 'PUT',
        headers: {
            ...jsonRequestHeaders(),
            Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        throw new Error('Failed to update prompt');
    }

    const payload = (await response.json()) as { prompt: AiSavedPrompt };

    return payload.prompt;
}

/**
 * Delete a saved project prompt (requires ai.prompts.manage).
 */
export async function deleteAiSavedPrompt(promptId: number): Promise<void> {
    const response = await fetch(`/ai/prompts/${promptId}`, {
        method: 'DELETE',
        headers: {
            ...jsonRequestHeaders(),
            Accept: 'application/json',
        },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error('Failed to delete prompt');
    }
}

/**
 * Split pending context chips into chat request ID lists.
 */
export function contextIdsFromPending(
    pending: AiPendingContextAttachment[],
): {
    contextItemIds: number[];
    contextFileIds: number[];
    contextPromptIds: number[];
} {
    return {
        contextItemIds: pending
            .filter((entry) => entry.kind === 'item')
            .map((entry) => entry.id),
        contextFileIds: pending
            .filter((entry) => entry.kind === 'file')
            .map((entry) => entry.id),
        contextPromptIds: pending
            .filter((entry) => entry.kind === 'prompt')
            .map((entry) => entry.id),
    };
}
