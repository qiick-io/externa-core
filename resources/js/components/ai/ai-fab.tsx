import { Link, usePage } from '@inertiajs/react';
import { RefreshCw, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AssistantMarkdown } from '@/components/ai/assistant-markdown';
import { ThinkingDots } from '@/components/ai/thinking-dots';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Message, MessageContent } from '@/components/ui/message';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { fetchAiStatus, streamAiChat } from '@/lib/ai-chat';
import type { AiStatus } from '@/lib/ai-chat';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { index as aiIndex } from '@/routes/ai';

type ChatLine = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isError?: boolean;
};

export function AiFab() {
    const { can } = useCan();
    const page = usePage();
    const canUseAi = can(PermissionEnum.CanUseAi);
    const isAiRoute =
        page.url === '/ai' || page.url.startsWith('/ai/') || page.url.startsWith('/ai?');

    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<AiStatus>({ online: false });
    const [composer, setComposer] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [toolHint, setToolHint] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatLine[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!canUseAi) {
            return;
        }

        let cancelled = false;

        const refresh = async () => {
            const next = await fetchAiStatus();

            if (!cancelled) {
                setStatus(next);
            }
        };

        void refresh();

        const onFocus = () => {
            void refresh();
        };

        window.addEventListener('focus', onFocus);
        const intervalId = window.setInterval(() => {
            void refresh();
        }, 15000);

        return () => {
            cancelled = true;
            abortControllerRef.current?.abort();
            window.removeEventListener('focus', onFocus);
            window.clearInterval(intervalId);
        };
    }, [canUseAi]);

    if (!canUseAi || isAiRoute) {
        return null;
    }

    const offline = !status.online;

    const handleStop = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
        setToolHint(null);
    };

    const findPrecedingUserMessage = (
        assistantMessageId: string,
    ): ChatLine | null => {
        const assistantIndex = messages.findIndex(
            (entry) => entry.id === assistantMessageId,
        );

        if (assistantIndex <= 0) {
            return null;
        }

        for (let index = assistantIndex - 1; index >= 0; index--) {
            if (messages[index]?.role === 'user') {
                return messages[index] ?? null;
            }
        }

        return null;
    };

    const runStream = async (
        message: string,
        baseMessages: ChatLine[],
    ): Promise<boolean> => {
        const assistantId = `assistant-${Date.now()}`;
        let completed = false;

        setMessages([
            ...baseMessages,
            { id: `user-${Date.now()}`, role: 'user', content: message },
            { id: assistantId, role: 'assistant', content: '' },
        ]);
        setIsStreaming(true);
        setToolHint(null);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            await streamAiChat(message, conversationId, {
                signal: abortController.signal,
                onToken: (token) => {
                    setMessages((current) =>
                        current.map((entry) =>
                            entry.id === assistantId
                                ? {
                                      ...entry,
                                      content: entry.content + token,
                                      isError: false,
                                  }
                                : entry,
                        ),
                    );
                },
                onTool: (toolName) => setToolHint(`Chiamata ${toolName}…`),
                onConversationId: setConversationId,
                onDone: () => {
                    completed = true;
                    abortControllerRef.current = null;
                    setIsStreaming(false);
                    setToolHint(null);
                },
                onError: () => {
                    abortControllerRef.current = null;
                    setIsStreaming(false);
                    setToolHint(null);
                },
            });

            return completed;
        } catch (error) {
            abortControllerRef.current = null;
            setIsStreaming(false);
            setToolHint(null);

            if (
                (error instanceof DOMException && error.name === 'AbortError') ||
                (error instanceof Error && error.name === 'AbortError')
            ) {
                return false;
            }

            const messageText =
                error instanceof Error
                    ? error.message
                    : 'Errore durante la risposta';

            setMessages((current) =>
                current.map((entry) =>
                    entry.id === assistantId
                        ? { ...entry, content: messageText, isError: true }
                        : entry,
                ),
            );
            toast.error(messageText);

            return false;
        }
    };

    const handleSend = async () => {
        const message = composer.trim();

        if (!message || isStreaming || offline) {
            return;
        }

        setComposer('');
        await runStream(message, messages);
    };

    const handleRetry = async (assistantMessageId: string) => {
        if (isStreaming || offline) {
            return;
        }

        const userMessage = findPrecedingUserMessage(assistantMessageId);

        if (!userMessage) {
            toast.error('Nessun messaggio utente da riprovare');

            return;
        }

        const prompt = userMessage.content.trim();

        if (!prompt) {
            return;
        }

        // Keep the failed prompt in the composer for optional edit/resend.
        setComposer(prompt);

        const baseMessages = messages.slice(
            0,
            messages.findIndex((entry) => entry.id === userMessage.id),
        );

        const succeeded = await runStream(prompt, baseMessages);

        if (succeeded) {
            setComposer('');
            toast.success('Messaggio reinviato');
        }
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        disabled={offline}
                        onClick={() => setOpen(true)}
                        aria-label={
                            offline
                                ? 'Assistant offline'
                                : 'Open AI assistant'
                        }
                        className={cn(
                            'fixed right-5 bottom-5 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-lg outline-none transition',
                            'focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2',
                            offline
                                ? 'cursor-not-allowed bg-zinc-400 opacity-70'
                                : 'bg-gradient-to-br from-orange-500 via-rose-500 to-amber-400 hover:scale-105',
                        )}
                    >
                        <Sparkles className="size-6" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                    {offline
                        ? 'AI offline — start LM Studio to enable'
                        : status.model
                          ? `Assistant online (${status.model})`
                          : 'Assistant online'}
                </TooltipContent>
            </Tooltip>

            <Drawer open={open} onOpenChange={setOpen} direction="right">
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>New chat</DrawerTitle>
                        <DrawerDescription>
                            Quick assistant drawer. Open the full page for history.
                        </DrawerDescription>
                    </DrawerHeader>

                    <DrawerBody className="gap-3">
                        {messages.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Ask about collections, items, or files.
                            </p>
                        ) : (
                            messages.map((message) => (
                                <Message
                                    key={message.id}
                                    align={
                                        message.role === 'user' ? 'end' : 'start'
                                    }
                                >
                                    <MessageContent>
                                        <Bubble
                                            variant={
                                                message.isError
                                                    ? 'destructive'
                                                    : message.role === 'user'
                                                      ? 'default'
                                                      : 'muted'
                                            }
                                            align={
                                                message.role === 'user'
                                                    ? 'end'
                                                    : 'start'
                                            }
                                        >
                                            <BubbleContent className="whitespace-pre-wrap">
                                                {message.role === 'assistant' ? (
                                                    message.isError ? (
                                                        <div className="flex flex-col gap-2">
                                                            <div>{message.content}</div>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="secondary"
                                                                className="w-fit"
                                                                disabled={
                                                                    isStreaming ||
                                                                    offline
                                                                }
                                                                onClick={() =>
                                                                    void handleRetry(
                                                                        message.id,
                                                                    )
                                                                }
                                                            >
                                                                <RefreshCw className="size-3.5" />
                                                                Riprova
                                                            </Button>
                                                        </div>
                                                    ) : message.content ? (
                                                        <AssistantMarkdown
                                                            content={message.content}
                                                        />
                                                    ) : isStreaming ? (
                                                        <ThinkingDots />
                                                    ) : null
                                                ) : (
                                                    message.content
                                                )}
                                            </BubbleContent>
                                        </Bubble>
                                    </MessageContent>
                                </Message>
                            ))
                        )}
                        {toolHint ? (
                            <p className="text-xs text-muted-foreground">
                                {toolHint}
                            </p>
                        ) : null}
                    </DrawerBody>

                    <DrawerFooter>
                        <form
                            className="flex w-full flex-col gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void handleSend();
                            }}
                        >
                            <Input
                                value={composer}
                                onChange={(event) =>
                                    setComposer(event.target.value)
                                }
                                placeholder={
                                    offline
                                        ? 'AI is offline…'
                                        : 'Ask something…'
                                }
                                disabled={offline || isStreaming}
                            />
                            <div className="flex items-center justify-between gap-2">
                                <Button variant="ghost" size="sm" asChild>
                                    <Link href={aiIndex.url()}>
                                        Open full assistant
                                    </Link>
                                </Button>
                                {isStreaming ? (
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={handleStop}
                                    >
                                        <Square className="size-3.5 fill-current" />
                                        Stop
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        disabled={offline || !composer.trim()}
                                    >
                                        Invia
                                    </Button>
                                )}
                            </div>
                        </form>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </>
    );
}
