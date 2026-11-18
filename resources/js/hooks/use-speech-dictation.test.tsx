import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
    getSpeechRecognitionConstructor: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'it' },
    }),
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: mocks.toastError },
}));

vi.mock('@/lib/ai-chat', () => ({
    getSpeechRecognitionConstructor: mocks.getSpeechRecognitionConstructor,
}));

import { useSpeechDictation } from '@/hooks/use-speech-dictation';

type Listener = (event: unknown) => void;

/** A stand-in `SpeechRecognition` that records its instances and listeners. */
function installFakeRecognition(
    options: { shouldThrowOnStart?: boolean } = {},
) {
    const instances: FakeRecognition[] = [];

    class FakeRecognition {
        lang = '';
        continuous = true;
        interimResults = true;
        listeners: Record<string, Listener> = {};
        start = vi.fn(() => {
            if (options.shouldThrowOnStart) {
                throw new Error('not allowed');
            }
        });
        stop = vi.fn();
        abort = vi.fn();

        constructor() {
            instances.push(this);
        }

        addEventListener(type: string, listener: Listener) {
            this.listeners[type] = listener;
        }
    }

    mocks.getSpeechRecognitionConstructor.mockReturnValue(FakeRecognition);

    return instances;
}

function speechResult(transcript: string, isFinal = true) {
    return Object.assign([{ transcript }], { isFinal });
}

function renderDictation() {
    const onTranscript = vi.fn();
    const rendered = renderHook(() => useSpeechDictation({ onTranscript }));

    return { ...rendered, onTranscript };
}

describe('useSpeechDictation', () => {
    beforeEach(() => {
        mocks.getSpeechRecognitionConstructor.mockReset();
        mocks.toastError.mockReset();
    });

    it('reports an unsupported browser and toasts on toggle', () => {
        mocks.getSpeechRecognitionConstructor.mockReturnValue(null);
        const { result } = renderDictation();

        expect(result.current.speechSupported).toBe(false);

        act(() => {
            result.current.toggleVoiceInput();
        });

        expect(result.current.isListening).toBe(false);
        expect(mocks.toastError).toHaveBeenCalledWith(
            'ai.dictationUnsupported',
        );
    });

    it('starts one final-only utterance in the UI language', () => {
        const instances = installFakeRecognition();
        const { result } = renderDictation();

        expect(result.current.speechSupported).toBe(true);

        act(() => {
            result.current.toggleVoiceInput();
        });

        expect(instances).toHaveLength(1);
        expect(instances[0]?.lang).toBe('it-IT');
        expect(instances[0]?.continuous).toBe(false);
        expect(instances[0]?.interimResults).toBe(false);
        expect(instances[0]?.start).toHaveBeenCalledOnce();
        expect(result.current.isListening).toBe(true);
    });

    it('passes the trimmed final transcript and skips interim or blank ones', () => {
        const instances = installFakeRecognition();
        const { result, onTranscript } = renderDictation();

        act(() => {
            result.current.toggleVoiceInput();
        });
        act(() => {
            instances[0]?.listeners.result?.({
                resultIndex: 0,
                results: [
                    speechResult(' hello '),
                    speechResult('ignored', false),
                ],
            });
            instances[0]?.listeners.result?.({
                resultIndex: 0,
                results: [speechResult('   ')],
            });
        });

        expect(onTranscript).toHaveBeenCalledTimes(1);
        expect(onTranscript).toHaveBeenCalledWith('hello');
    });

    it('stops on a second toggle and when the utterance ends', () => {
        const instances = installFakeRecognition();
        const { result } = renderDictation();

        act(() => {
            result.current.toggleVoiceInput();
        });
        act(() => {
            result.current.toggleVoiceInput();
        });

        expect(instances[0]?.stop).toHaveBeenCalledOnce();
        expect(result.current.isListening).toBe(false);

        act(() => {
            result.current.toggleVoiceInput();
        });

        expect(instances).toHaveLength(2);
        expect(result.current.isListening).toBe(true);

        act(() => {
            instances[1]?.listeners.end?.({});
        });

        expect(result.current.isListening).toBe(false);
    });

    it('toasts when recognition fails or cannot start', () => {
        const instances = installFakeRecognition();
        const { result } = renderDictation();

        act(() => {
            result.current.toggleVoiceInput();
        });
        act(() => {
            instances[0]?.listeners.error?.({});
        });

        expect(result.current.isListening).toBe(false);
        expect(mocks.toastError).toHaveBeenCalledWith('ai.dictationError');

        installFakeRecognition({ shouldThrowOnStart: true });

        act(() => {
            result.current.toggleVoiceInput();
        });

        expect(result.current.isListening).toBe(false);
        expect(mocks.toastError).toHaveBeenCalledWith(
            'ai.unableStartDictation',
        );
    });

    it('aborts an active recognition on unmount', () => {
        const instances = installFakeRecognition();
        const { result, unmount } = renderDictation();

        act(() => {
            result.current.toggleVoiceInput();
        });
        unmount();

        expect(instances[0]?.abort).toHaveBeenCalledOnce();
    });
});
