import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import { assertOk, parseError } from '@/lib/http';
import i18n from '@/lib/i18n';
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
            error: i18n.t('ai.errors.tooManyAttachments'),
        };
    }

    const candidates = Array.from(files);
    const accepted: File[] = [];
    let error: string | null = null;

    for (const file of candidates) {
        if (accepted.length >= remainingSlots) {
            error = i18n.t('ai.errors.tooManyAttachments');
            break;
        }

        if (!isAcceptedAiChatAttachment(file)) {
            error = i18n.t('ai.errors.unsupportedAttachment');
            continue;
        }

        if (file.size > AI_CHAT_ATTACHMENT_MAX_BYTES) {
            error = i18n.t('ai.errors.attachmentTooLarge');
            continue;
        }

        accepted.push(file);
    }

    if (accepted.length === 0 && error === null && candidates.length > 0) {
        error = i18n.t('ai.errors.unsupportedAttachment');
    }

    return { files: accepted, error };
}

/** Online status and active model name from the AI status endpoint. */
export type AiStatus = {
    online: boolean;
    model?: string | null;
    /** Context window (tokens) of the assistant's provider, for the usage display. */
    context_window?: number | null;
    /** The user's AI usage today; null when no daily prompt cap or token budget is set. */
    daily_usage?: AiDailyUsage | null;
};

/** Today's prompts and tokens against the daily limits (a limit is null when off). */
export type AiDailyUsage = {
    prompts_used: number;
    prompt_limit: number | null;
    tokens_used: number;
    token_budget: number | null;
};

/** Destructive tool call the paused assistant turn is waiting on (laravel/ai `tool_approval_request`). */
export type AiPendingApproval = {
    id: string;
    tool: string;
    arguments?: Record<string, unknown>;
    reason?: string | null;
};

/** User decision for one pending tool approval, sent to resume a paused turn. */
export type AiApprovalDecision = {
    id: string;
    approved: boolean;
};

/**
 * Short notice shown on a turn paused for tool approval. It names no tool: the
 * approval card below it describes each call in words.
 *
 * @returns The translated notice
 */
export function awaitingApprovalContent(): string {
    return i18n.t('ai.awaitingApproval');
}

/**
 * Whether a pending call deletes data. The server's approval reason says so in
 * a fixed form ("ManageFiles delete deletes data.", from
 * `RequiresDestructiveApprovalTrait::needsApproval()`); a write ends in
 * "writes data.".
 */
export function isDestructiveApproval(approval: AiPendingApproval): boolean {
    return approval.reason?.endsWith(' deletes data.') ?? false;
}

/** Callbacks invoked while consuming an AI chat SSE stream. */
/** How a streamed tool call ended. */
export type AiToolResultDetail = {
    id: string;
    successful: boolean;
    error: string | null;
    denied: boolean;
};

export type AiStreamHandlers = {
    onToken?: (token: string) => void;
    onTool?: (
        toolName: string,
        call?: { id: string; arguments: unknown },
    ) => void;
    onToolResult?: (
        toolName: string,
        result: unknown,
        detail?: AiToolResultDetail,
    ) => void;
    onReasoningDelta?: (reasoningId: string, delta: string) => void;
    onReasoningEnd?: (reasoningId: string) => void;
    onCitation?: (citation: { url: string; title: string | null }) => void;
    onProviderTool?: (tool: {
        id: string;
        kind: string;
        data: Record<string, unknown>;
    }) => void;
    onStreamStart?: (meta: {
        provider: string | null;
        model: string | null;
    }) => void;
    onStreamEnd?: (usage: Record<string, number> | null) => void;
    onApprovalRequest?: (approvals: AiPendingApproval[]) => void;
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
    tool_id?: string;
    id?: string;
    arguments?: unknown;
    name?: string;
    result?: unknown;
    successful?: boolean;
    error?: string | null;
    denied?: boolean;
    preliminary?: boolean;
    approvals?: AiPendingApproval[];
    reasoning_id?: string;
    citation?: { url?: string; title?: string | null };
    item_id?: string;
    data?: Record<string, unknown>;
    provider?: string | null;
    model?: string | null;
    usage?: Record<string, number> | null;
};

/** laravel/ai event types handled as reasoning, citations and stream bookends. */
const PASSIVE_EVENT_TYPES = new Set([
    'reasoning_start',
    'text_start',
    'text_end',
]);

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
 * @param signal - Optional abort signal (FAB cleanup / timeout)
 * @returns Online flag and optional model name
 */
export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus> {
    // ponytail: bound status probe so a stuck /ai/status cannot pin browser suites open.
    const timeoutMs = 5_000;
    const timeoutController = new AbortController();
    const timer = window.setTimeout(() => timeoutController.abort(), timeoutMs);
    const onOuterAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
        const response = await fetch('/ai/status', {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
            signal: timeoutController.signal,
        });

        if (!response.ok) {
            return { online: false };
        }

        return (await response.json()) as AiStatus;
    } catch {
        return { online: false };
    } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onOuterAbort);
    }
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
        throw new Error(
            await parseError(
                response,
                i18n.t('ai.errors.attachmentUploadFailed'),
            ),
        );
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
 * @param approvals - Decisions resuming a turn paused for tool approval (message may be empty)
 * @returns {void}
 */
/** Explicit collection/file/prompt context attached to a chat turn (#195). */
export type AiChatContextIds = {
    itemIds?: number[];
    fileIds?: number[];
    promptIds?: number[];
};

export async function streamAiChat(
    message: string,
    conversationId: string | null | undefined,
    handlers: AiStreamHandlers = {},
    attachmentIds: string[] = [],
    approvals: AiApprovalDecision[] = [],
    context: AiChatContextIds = {},
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
                context_item_ids: context.itemIds ?? [],
                context_file_ids: context.fileIds ?? [],
                context_prompt_ids: context.promptIds ?? [],
                ...(approvals.length > 0 ? { approvals } : {}),
            }),
        });
    } catch (error) {
        if (isAbortError(error) || handlers.signal?.aborted) {
            /* ponytail: intentional abort — skip onDone so callers do not navigate/reload */
            return;
        }

        const networkError = new Error(
            error instanceof TypeError
                ? i18n.t('ai.errors.connectionInterrupted')
                : error instanceof Error
                  ? error.message
                  : i18n.t('ai.errors.network'),
        );
        handlers.onError?.(networkError);

        throw networkError;
    }

    if (!response.ok) {
        const detail = await parseError(
            response,
            `Chat send failed (${response.status})`,
        );
        const error = new Error(detail);
        handlers.onError?.(error);

        throw error;
    }

    if (!response.body) {
        const error = new Error(i18n.t('ai.errors.noResponseStream'));
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
                        handlers.onTool?.(toolName, {
                            id: parsed.tool_id ?? parsed.id ?? toolName,
                            arguments: parsed.arguments ?? {},
                        });
                    }

                    continue;
                }

                if (
                    parsed.type === 'tool_result' ||
                    parsed.type === 'tool-result'
                ) {
                    if (!abortSignal?.aborted && !parsed.preliminary) {
                        const toolName =
                            parsed.tool_name ?? parsed.name ?? 'tool';
                        handlers.onToolResult?.(toolName, parsed.result, {
                            id: parsed.tool_id ?? parsed.id ?? toolName,
                            successful:
                                parsed.successful ??
                                (parsed.error === null ||
                                    parsed.error === undefined),
                            error: parsed.error ?? null,
                            denied: parsed.denied === true,
                        });
                    }

                    continue;
                }

                if (parsed.type === 'reasoning_delta') {
                    if (!abortSignal?.aborted && parsed.delta) {
                        handlers.onReasoningDelta?.(
                            parsed.reasoning_id ?? 'reasoning',
                            parsed.delta,
                        );
                    }

                    continue;
                }

                if (parsed.type === 'reasoning_end') {
                    if (!abortSignal?.aborted) {
                        handlers.onReasoningEnd?.(
                            parsed.reasoning_id ?? 'reasoning',
                        );
                    }

                    continue;
                }

                if (parsed.type === 'citation') {
                    if (!abortSignal?.aborted && parsed.citation?.url) {
                        handlers.onCitation?.({
                            url: parsed.citation.url,
                            title: parsed.citation.title ?? null,
                        });
                    }

                    continue;
                }

                if (parsed.type === 'stream_start') {
                    if (!abortSignal?.aborted) {
                        handlers.onStreamStart?.({
                            provider: parsed.provider ?? null,
                            model: parsed.model ?? null,
                        });
                    }

                    continue;
                }

                if (parsed.type === 'stream_end') {
                    if (!abortSignal?.aborted) {
                        handlers.onStreamEnd?.(parsed.usage ?? null);
                    }

                    continue;
                }

                if (parsed.type && PASSIVE_EVENT_TYPES.has(parsed.type)) {
                    continue;
                }

                // Provider-hosted tools (web search, code interpreter) carry an item id.
                if (parsed.item_id && parsed.type) {
                    if (!abortSignal?.aborted) {
                        handlers.onProviderTool?.({
                            id: parsed.item_id,
                            kind: parsed.type,
                            data: parsed.data ?? {},
                        });
                    }

                    continue;
                }

                if (parsed.type === 'tool_approval_request') {
                    if (!abortSignal?.aborted && parsed.approvals) {
                        handlers.onApprovalRequest?.(parsed.approvals);
                    }

                    continue;
                }

                if (parsed.type === 'error') {
                    if (!abortSignal?.aborted) {
                        const streamError = new Error(
                            typeof parsed.message === 'string' &&
                                parsed.message !== ''
                                ? parsed.message
                                : i18n.t('ai.errors.stream'),
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
                ? i18n.t('ai.errors.streamInterrupted')
                : error instanceof Error
                  ? error.message
                  : i18n.t('ai.errors.stream'),
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

/** Status checks that may fail in a row before the import poll gives up (#441). */
export const IMPORT_POLL_MAX_FAILURES = 5;

/**
 * Delay before the next import status check: 2 s while the job runs, then doubling after each
 * failed check (2, 4, 8, 16 s, capped at 30 s), or null once the poll should stop.
 *
 * @param consecutiveFailures - Failed status checks in a row (0 after a successful one)
 * @returns Milliseconds to wait, or null to stop polling
 */
export function nextImportPollDelay(
    consecutiveFailures: number,
): number | null {
    if (consecutiveFailures >= IMPORT_POLL_MAX_FAILURES) {
        return null;
    }

    return Math.min(2000 * 2 ** consecutiveFailures, 30000);
}

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

    await assertOk(response, 'Unable to read import status');

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
    search = '',
): Promise<Paginated<AiConversationSummary>> {
    const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
    });

    if (search !== '') {
        params.set('q', search);
    }

    const response = await fetch(`/ai/conversations?${params.toString()}`, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    });

    await assertOk(response, i18n.t('ai.errors.loadConversations'));

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

    await assertOk(response, i18n.t('ai.unableStartChat'));

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

    await assertOk(response, i18n.t('ai.unableDeleteChat'));
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

    await assertOk(response, i18n.t('ai.unableDeleteSelectedChats'));

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

    await assertOk(response, i18n.t('ai.unableUpdatePin'));

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

    await assertOk(response, i18n.t('ai.errors.truncate'));

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
        throw new Error(i18n.t('ai.errors.popupBlocked'));
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
        throw new Error(i18n.t('ai.speechUnavailable'));
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
