import { jsonRequestHeaders } from '@/lib/csrf';
import { normalizePaginated, type LaravelPaginated } from '@/lib/pagination';
import type { Paginated } from '@/types/admin';

export type AiConversationSummary = {
    id: string;
    title: string;
    pinned_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export type AiStatus = {
    online: boolean;
    model?: string | null;
};

export type AiStreamHandlers = {
    onToken?: (token: string) => void;
    onTool?: (toolName: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (error: Error) => void;
    onConversationId?: (conversationId: string) => void;
    signal?: AbortSignal;
};

type ParsedSsePayload = {
    type?: string;
    delta?: string;
    text?: string;
    content?: string;
    conversation_id?: string;
    tool_call?: { name?: string };
    tool_name?: string;
    name?: string;
};

function parseSseData(data: string): ParsedSsePayload | null {
    if (data === '[DONE]' || data === '') {
        return null;
    }

    try {
        return JSON.parse(data) as ParsedSsePayload;
    } catch {
        return { type: 'text_delta', delta: data };
    }
}

function extractToken(parsed: ParsedSsePayload): string | null {
    // laravel/ai StreamEvent shapes: text_delta.delta (also vercel-style text-delta)
    if (
        parsed.type === 'text_delta' ||
        parsed.type === 'text-delta' ||
        parsed.type === undefined
    ) {
        const token = parsed.delta ?? parsed.text ?? parsed.content;

        if (typeof token === 'string' && token !== '') {
            return token;
        }
    }

    return null;
}

function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

export async function fetchAiStatus(): Promise<AiStatus> {
    const response = await fetch('/ai/status', {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        return { online: false };
    }

    return (await response.json()) as AiStatus;
}

export async function streamAiChat(
    message: string,
    conversationId: string | null | undefined,
    handlers: AiStreamHandlers = {},
): Promise<void> {
    let response: Response;

    try {
        response = await fetch('/ai/chat', {
            method: 'POST',
            headers: {
                ...jsonRequestHeaders(),
                Accept: 'text/event-stream',
            },
            credentials: 'same-origin',
            signal: handlers.signal,
            body: JSON.stringify({
                message,
                conversation_id: conversationId ?? null,
            }),
        });
    } catch (error) {
        if (isAbortError(error)) {
            // ponytail: abort is intentional stop — skip onDone so callers do not navigate/reload
            return;
        }

        const networkError =
            error instanceof Error ? error : new Error('Errore di rete');
        handlers.onError?.(networkError);

        throw networkError;
    }

    if (!response.ok) {
        let detail = `Invio chat non riuscito (${response.status})`;

        try {
            const payload = (await response.json()) as { message?: string };

            if (payload.message) {
                detail = payload.message;
            }
        } catch {
            // keep default
        }

        const error = new Error(detail);
        handlers.onError?.(error);

        throw error;
    }

    if (!response.body) {
        const error = new Error('Nessuno stream di risposta');
        handlers.onError?.(error);

        throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();

                if (!trimmed.startsWith('data:')) {
                    continue;
                }

                const data = trimmed.slice(5).trim();

                if (data === '[DONE]') {
                    handlers.onDone?.(fullText);

                    return;
                }

                const parsed = parseSseData(data);

                if (!parsed) {
                    continue;
                }

                if (parsed.type === 'conversation' && parsed.conversation_id) {
                    handlers.onConversationId?.(parsed.conversation_id);
                    continue;
                }

                if (parsed.type === 'tool_call' || parsed.type === 'tool-call') {
                    const toolName =
                        parsed.tool_name ??
                        parsed.tool_call?.name ??
                        parsed.name ??
                        'tool';
                    handlers.onTool?.(toolName);
                    continue;
                }

                const token = extractToken(parsed);

                if (token !== null) {
                    fullText += token;
                    handlers.onToken?.(token);
                }
            }
        }

        handlers.onDone?.(fullText);
    } catch (error) {
        if (isAbortError(error)) {
            // ponytail: abort is intentional stop — skip onDone so callers do not navigate/reload
            return;
        }

        const streamError =
            error instanceof Error ? error : new Error('Errore durante lo stream');
        handlers.onError?.(streamError);

        throw streamError;
    }
}

function mapConversationSummary(raw: AiConversationSummary): AiConversationSummary {
    return {
        id: raw.id,
        title: raw.title,
        pinned_at: raw.pinned_at ?? null,
        created_at: raw.created_at ?? null,
        updated_at: raw.updated_at ?? null,
    };
}

export async function fetchAiConversationsPage(
    page: number,
    perPage = 25,
): Promise<Paginated<AiConversationSummary>> {
    const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
    });
    const response = await fetch(`/ai/conversations?${params.toString()}`, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error('Impossibile caricare le conversazioni');
    }

    const payload = (await response.json()) as
        | LaravelPaginated<AiConversationSummary>
        | Paginated<AiConversationSummary>;
    const paginated = normalizePaginated(payload);

    return {
        ...paginated,
        data: paginated.data.map(mapConversationSummary),
    };
}

export async function createAiConversation(title?: string): Promise<{ id: string; title: string }> {
    const response = await fetch('/ai/conversations', {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ title: title ?? null }),
    });

    if (!response.ok) {
        throw new Error('Impossibile creare la conversazione');
    }

    const payload = (await response.json()) as {
        conversation: { id: string; title: string };
    };

    return payload.conversation;
}

export async function deleteAiConversation(conversationId: string): Promise<void> {
    const response = await fetch(`/ai/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error('Impossibile eliminare la chat');
    }
}

export async function bulkDeleteAiConversations(
    conversationIds: string[],
): Promise<{ deleted: number }> {
    const response = await fetch('/ai/conversations/bulk-destroy', {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ ids: conversationIds }),
    });

    if (!response.ok) {
        throw new Error('Impossibile eliminare le chat selezionate');
    }

    return (await response.json()) as { deleted: number };
}

export async function toggleAiConversationPin(
    conversationId: string,
): Promise<{
    id: string;
    title: string;
    pinned_at: string | null;
}> {
    const response = await fetch(`/ai/conversations/${conversationId}/pin`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error('Impossibile aggiornare il pin');
    }

    const payload = (await response.json()) as {
        conversation: {
            id: string;
            title: string;
            pinned_at: string | null;
        };
    };

    return payload.conversation;
}

export async function truncateAiConversationFrom(
    conversationId: string,
    fromMessageId: string,
): Promise<{ deleted: number }> {
    const response = await fetch(`/ai/conversations/${conversationId}/truncate`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ from_message_id: fromMessageId }),
    });

    if (!response.ok) {
        throw new Error('Could not truncate conversation');
    }

    return (await response.json()) as { deleted: number };
}

export function exportTextAsPdf(title: string, content: string): void {
    // ponytail: browser print-to-PDF instead of a PDF library
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');

    if (!printWindow) {
        throw new Error('Popup bloccato: consenti le finestre popup per esportare il PDF');
    }

    const escapedTitle = title
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    const escapedContent = content
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

    printWindow.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>${escapedTitle}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; line-height: 1.5; white-space: pre-wrap; }
  h1 { font-size: 1.125rem; margin: 0 0 1rem; }
</style>
</head>
<body>
<h1>${escapedTitle}</h1>
<div>${escapedContent}</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    printWindow.document.close();
}

export function speakText(text: string, locale = 'it-IT'): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        throw new Error('Sintesi vocale non supportata in questo browser');
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
