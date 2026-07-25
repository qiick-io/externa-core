import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import type { Paginated } from '@/types/admin';

/** Summary row for an AI conversation in list views. */
export type AiConversationSummary = {
    id: string;
    title: string;
    pinned_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

/** Uploaded attachment metadata returned after a successful chat upload. */
export type AiChatAttachment = {
    id: string;
    name: string;
    mime?: string | null;
    size?: number | null;
};

/** `accept` attribute value for AI chat file attachments. */
export const AI_CHAT_ATTACHMENT_ACCEPT =
    '.csv,.txt,.xlsx,.pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf';
/** Maximum number of attachments per chat message. */
export const AI_CHAT_ATTACHMENT_MAX_COUNT = 5;
/** Maximum size in bytes for a single chat attachment (5 MiB). */
export const AI_CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Checks whether a file matches allowed AI chat attachment types by extension or MIME.
 *
 * @param file - Browser file to validate
 * @returns Whether the file type is accepted
 */
export function isAcceptedAiChatAttachment(file: File): boolean {
    const lowerName = file.name.toLowerCase();

    if (
        lowerName.endsWith('.csv') ||
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.xlsx') ||
        lowerName.endsWith('.pdf')
    ) {
        return true;
    }

    const mime = file.type.toLowerCase();

    return (
        mime === 'text/csv' ||
        mime === 'text/plain' ||
        mime === 'application/csv' ||
        mime === 'application/vnd.ms-excel' ||
        mime ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mime === 'application/pdf'
    );
}

/**
 * Client-side filter matching paperclip accept rules plus max count and size limits.
 * Rejected files are skipped; `error` is set when nothing usable remains or limits were hit.
 *
 * @param files - Candidate files from input or drop
 * @param currentCount - Attachments already selected for this message
 * @returns Accepted files and an optional user-facing error message
 */
export function pickAiChatAttachmentFiles(
    files: FileList | File[],
    currentCount: number,
): { files: File[]; error: string | null } {
    const remainingSlots = AI_CHAT_ATTACHMENT_MAX_COUNT - currentCount;

    if (remainingSlots <= 0) {
        return {
            files: [],
            error: 'Puoi allegare al massimo 5 file per messaggio',
        };
    }

    const candidates = Array.from(files);
    const accepted: File[] = [];
    let error: string | null = null;

    for (const file of candidates) {
        if (accepted.length >= remainingSlots) {
            error = 'Puoi allegare al massimo 5 file per messaggio';
            break;
        }

        if (!isAcceptedAiChatAttachment(file)) {
            error = 'Sono ammessi solo file CSV, TXT, XLSX o PDF';
            continue;
        }

        if (file.size > AI_CHAT_ATTACHMENT_MAX_BYTES) {
            error = 'Il file supera il limite di 5 MB.';
            continue;
        }

        accepted.push(file);
    }

    if (accepted.length === 0 && error === null && candidates.length > 0) {
        error = 'Sono ammessi solo file CSV, TXT, XLSX o PDF';
    }

    return { files: accepted, error };
}

/** Online status and active model name from the AI status endpoint. */
export type AiStatus = {
    online: boolean;
    model?: string | null;
};

/** Callbacks invoked while consuming an AI chat SSE stream. */
export type AiStreamHandlers = {
    onToken?: (token: string) => void;
    onTool?: (toolName: string) => void;
    onToolResult?: (toolName: string, result: unknown) => void;
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
    message?: string;
    conversation_id?: string;
    tool_call?: { name?: string };
    tool_name?: string;
    name?: string;
    result?: unknown;
};

/**
 * Parses a single SSE `data:` payload line into a structured event object.
 *
 * @param data - Raw JSON or plain-text payload after the `data:` prefix
 * @returns Parsed event, or null for `[DONE]` / empty payloads
 */
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

/**
 * Extracts a text token from laravel/ai and Vercel-style stream event shapes.
 *
 * @param parsed - Parsed SSE payload
 * @returns Token string, or null when the event is not a text delta
 */
function extractToken(parsed: ParsedSsePayload): string | null {
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

/**
 * @param error - Caught rejection value
 * @returns Whether the error represents an intentional abort
 */
export function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

/**
 * Fetches whether the AI backend is reachable and which model is active.
 *
 * @returns Online flag and optional model name
 */
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

/**
 * Uploads a chat attachment and returns server-assigned metadata.
 *
 * @param file - File to upload
 * @returns Attachment record with id and display fields
 */
export async function uploadAiAttachment(
    file: File,
): Promise<AiChatAttachment> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/ai/attachments', {
        method: 'POST',
        headers: formRequestHeaders(),
        credentials: 'same-origin',
        body: formData,
    });

    if (!response.ok) {
        let detail = 'Attachment upload failed';

        try {
            const payload = (await response.json()) as {
                message?: string;
                errors?: { file?: string[] };
            };

            detail = payload.errors?.file?.[0] ?? payload.message ?? detail;
        } catch {
            /* Use default English error message when response body is not JSON */
        }

        throw new Error(detail);
    }

    const payload = (await response.json()) as {
        attachment: AiChatAttachment;
    };

    return payload.attachment;
}

/**
 * Sends a chat message and consumes the SSE response stream.
 * Aborts silently without calling `onDone` when `handlers.signal` is aborted.
 *
 * @param message - User prompt text
 * @param conversationId - Existing conversation id, or null for a new thread
 * @param handlers - Stream event callbacks and optional abort signal
 * @param attachmentIds - Previously uploaded attachment ids to include
 * @returns {void}
 */
export async function streamAiChat(
    message: string,
    conversationId: string | null | undefined,
    handlers: AiStreamHandlers = {},
    attachmentIds: string[] = [],
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
                attachment_ids: attachmentIds,
            }),
        });
    } catch (error) {
        if (isAbortError(error) || handlers.signal?.aborted) {
            /* ponytail: intentional abort — skip onDone so callers do not navigate/reload */
            return;
        }

        const networkError = new Error(
            error instanceof TypeError
                ? 'Connection to the AI server was interrupted (timeout, proxy, or local model crash). Check LM Studio and retry with a smaller prompt.'
                : error instanceof Error
                  ? error.message
                  : 'Network error',
        );
        handlers.onError?.(networkError);

        throw networkError;
    }

    if (!response.ok) {
        let detail = `Chat send failed (${response.status})`;

        try {
            const payload = (await response.json()) as { message?: string };

            if (payload.message) {
                detail = payload.message;
            }
        } catch {
            /* Use default error message when response body is not JSON */
        }

        const error = new Error(detail);
        handlers.onError?.(error);

        throw error;
    }

    if (!response.body) {
        const error = new Error('No response stream');
        handlers.onError?.(error);

        throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const abortSignal = handlers.signal;

    const cancelReader = (): void => {
        void reader.cancel().catch(() => {
            /* Reader may already be closed after abort */
        });
    };

    abortSignal?.addEventListener('abort', cancelReader, { once: true });

    if (abortSignal?.aborted) {
        cancelReader();

        return;
    }

    try {
        while (true) {
            if (abortSignal?.aborted) {
                cancelReader();

                return;
            }

            const { done, value } = await reader.read();

            if (abortSignal?.aborted) {
                return;
            }

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (abortSignal?.aborted) {
                    return;
                }

                const trimmed = line.trim();

                if (!trimmed.startsWith('data:')) {
                    continue;
                }

                const data = trimmed.slice(5).trim();

                if (data === '[DONE]') {
                    if (abortSignal?.aborted) {
                        return;
                    }

                    handlers.onDone?.(fullText);

                    return;
                }

                const parsed = parseSseData(data);

                if (!parsed) {
                    continue;
                }

                if (parsed.type === 'conversation' && parsed.conversation_id) {
                    if (!abortSignal?.aborted) {
                        handlers.onConversationId?.(parsed.conversation_id);
                    }

                    continue;
                }

                if (
                    parsed.type === 'tool_call' ||
                    parsed.type === 'tool-call'
                ) {
                    if (!abortSignal?.aborted) {
                        const toolName =
                            parsed.tool_name ??
                            parsed.tool_call?.name ??
                            parsed.name ??
                            'tool';
                        handlers.onTool?.(toolName);
                    }

                    continue;
                }

                if (
                    parsed.type === 'tool_result' ||
                    parsed.type === 'tool-result'
                ) {
                    if (!abortSignal?.aborted) {
                        handlers.onToolResult?.(
                            parsed.tool_name ?? parsed.name ?? 'tool',
                            parsed.result,
                        );
                    }

                    continue;
                }

                if (parsed.type === 'error') {
                    if (!abortSignal?.aborted) {
                        const streamError = new Error(
                            typeof parsed.message === 'string' &&
                            parsed.message !== ''
                                ? parsed.message
                                : 'Error during AI stream',
                        );
                        handlers.onError?.(streamError);
                    }

                    return;
                }

                const token = extractToken(parsed);

                if (token !== null && !abortSignal?.aborted) {
                    fullText += token;
                    handlers.onToken?.(token);
                }
            }
        }

        if (abortSignal?.aborted) {
            return;
        }

        handlers.onDone?.(fullText);
    } catch (error) {
        if (isAbortError(error) || abortSignal?.aborted) {
            /* ponytail: intentional abort — skip onDone so callers do not navigate/reload */
            return;
        }

        // Browsers surface mid-SSE disconnects as TypeError "network error" (Herd nginx
        // fastcgi_read_timeout 60s when the local model thinks without emitting events).
        const streamError = new Error(
            error instanceof TypeError
                ? 'AI stream connection interrupted (proxy/nginx timeout or slow local model). Check LM Studio and that fastcgi_read_timeout is ≥ 600s, then retry.'
                : error instanceof Error
                  ? error.message
                  : 'Error during stream',
        );
        handlers.onError?.(streamError);

        throw streamError;
    } finally {
        abortSignal?.removeEventListener('abort', cancelReader);
    }
}

/** Progress payload for a background AI import job. */
export type AiImportJobStatus = {
    job_id: string;
    status: 'queued' | 'running' | 'done' | 'failed';
    processed: number;
    total: number | null;
    message: string;
    result?: Record<string, unknown> | null;
};

/**
 * Polls the status of a background AI import job.
 *
 * @param jobId - Import job id returned when the job was queued
 * @returns Current job status and progress counters
 */
export async function fetchAiImportJobStatus(
    jobId: string,
): Promise<AiImportJobStatus> {
    const response = await fetch(`/ai/import-jobs/${jobId}`, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error('Unable to read import status');
    }

    return (await response.json()) as AiImportJobStatus;
}

function mapConversationSummary(
    raw: AiConversationSummary,
): AiConversationSummary {
    return {
        id: raw.id,
        title: raw.title,
        pinned_at: raw.pinned_at ?? null,
        created_at: raw.created_at ?? null,
        updated_at: raw.updated_at ?? null,
    };
}

/**
 * Fetches a paginated list of AI conversations.
 *
 * @param page - 1-based page number
 * @param perPage - Page size (default 25)
 * @returns Normalized paginated conversation summaries
 */
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
        throw new Error('Unable to load conversations');
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

/**
 * Creates a new AI conversation thread.
 *
 * @param title - Optional initial title
 * @returns New conversation id and title
 */
export async function createAiConversation(
    title?: string,
): Promise<{ id: string; title: string }> {
    const response = await fetch('/ai/conversations', {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ title: title ?? null }),
    });

    if (!response.ok) {
        throw new Error('Unable to create conversation');
    }

    const payload = (await response.json()) as {
        conversation: { id: string; title: string };
    };

    return payload.conversation;
}

/**
 * Deletes an AI conversation and its messages.
 *
 * @param conversationId - Conversation id to delete
 * @returns {void}
 */
export async function deleteAiConversation(
    conversationId: string,
): Promise<void> {
    const response = await fetch(`/ai/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error('Unable to delete chat');
    }
}

/**
 * Soft-deletes multiple AI conversations in one request.
 *
 * @param conversationIds - Ids to delete
 * @returns Count of conversations deleted
 */
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
        throw new Error('Unable to delete selected chats');
    }

    return (await response.json()) as { deleted: number };
}

/**
 * Toggles pin state on a conversation.
 *
 * @param conversationId - Conversation id
 * @returns Updated conversation id, title, and pin timestamp
 */
export async function toggleAiConversationPin(conversationId: string): Promise<{
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
        throw new Error('Unable to update pin');
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

/**
 * Truncates a conversation from a given message id onward (inclusive).
 *
 * @param conversationId - Conversation id
 * @param fromMessageId - First message id to remove
 * @returns Count of deleted messages
 */
export async function truncateAiConversationFrom(
    conversationId: string,
    fromMessageId: string,
): Promise<{ deleted: number }> {
    const response = await fetch(
        `/ai/conversations/${conversationId}/truncate`,
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ from_message_id: fromMessageId }),
        },
    );

    if (!response.ok) {
        throw new Error('Could not truncate conversation');
    }

    return (await response.json()) as { deleted: number };
}

type ConversationMessageRow = {
    id: string;
    role: string;
    content: string;
};

/**
 * Returns whether persisted user message content matches a cancelled prompt.
 * During an aborted stream, Laravel AI may store an attachment-augmented prompt.
 *
 * @param content - Stored message body
 * @param prompt - Original prompt the user submitted
 * @returns Whether truncation should target this message
 */
function userMessageMatchesStoppedPrompt(
    content: string,
    prompt: string,
): boolean {
    const normalizedContent = content.trim();
    const normalizedPrompt = prompt.trim();

    if (normalizedPrompt === '') {
        return false;
    }

    return (
        normalizedContent === normalizedPrompt ||
        normalizedContent.startsWith(normalizedPrompt)
    );
}

/**
 * Best-effort cleanup after Stop: deletes the last persisted user turn when it
 * matches the cancelled prompt (avoids truncating an older turn if save raced).
 *
 * @param conversationId - Conversation id
 * @param prompt - Prompt text the user submitted before aborting
 * @returns Deletion result, or null when no matching message was found
 */
export async function truncateLastUserMessageIfMatches(
    conversationId: string,
    prompt: string,
): Promise<{ deleted: number } | null> {
    const response = await fetch(`/ai/conversations/${conversationId}`, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        return null;
    }

    const payload = (await response.json()) as {
        messages?: ConversationMessageRow[];
    };
    const messages = payload.messages ?? [];

    for (let index = messages.length - 1; index >= 0; index--) {
        const entry = messages[index];

        if (entry?.role !== 'user') {
            continue;
        }

        if (!userMessageMatchesStoppedPrompt(entry.content, prompt)) {
            return null;
        }

        return truncateAiConversationFrom(conversationId, entry.id);
    }

    return null;
}

/**
 * Opens a print dialog so the user can save chat content as PDF.
 * ponytail: uses browser print-to-PDF instead of a PDF library.
 *
 * @param title - Document title shown in the print preview
 * @param content - Plain text body to print
 * @returns {void}
 */
export function exportTextAsPdf(title: string, content: string): void {
    const printWindow = window.open(
        '',
        '_blank',
        'noopener,noreferrer,width=720,height=900',
    );

    if (!printWindow) {
        throw new Error(
            'Popup bloccato: consenti le finestre popup per esportare il PDF',
        );
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

/**
 * Speaks plain text using the Web Speech API.
 *
 * @param text - Text to synthesize
 * @param locale - BCP 47 language tag (default `en-US`)
 * @returns {void}
 */
export function speakText(text: string, locale = 'en-US'): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        throw new Error('Speech synthesis is not supported in this browser');
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    window.speechSynthesis.speak(utterance);
}

/**
 * Cancels any in-progress speech synthesis.
 *
 * @returns {void}
 */
export function stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}

/**
 * Returns the browser speech recognition constructor when available.
 *
 * @returns Constructor, or null outside a supporting browser context
 */
export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
