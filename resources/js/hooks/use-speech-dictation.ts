import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSpeechRecognitionConstructor } from '@/lib/ai-chat';
import { speechRecognitionLang } from '@/lib/format';
import { toast } from '@/lib/toast';

export type UseSpeechDictationOptions = {
    /** Receives each non-empty final transcript, already trimmed. */
    onTranscript: (transcript: string) => void;
};

/**
 * Voice dictation through the browser's Web Speech API: one utterance per
 * toggle in the current UI language, final results only. It renders nothing.
 *
 * Side effects: starts and stops a `SpeechRecognition`, toasts when dictation
 * is unsupported, fails or cannot start, and aborts it on unmount.
 *
 * @param options - Where the recognised text goes
 * @returns Whether it is listening, whether the browser supports it, and the toggle
 */
export function useSpeechDictation(options: UseSpeechDictationOptions) {
    const { t, i18n } = useTranslation();
    const [isListening, setIsListening] = useState(false);
    const [speechSupported] = useState(
        () => getSpeechRecognitionConstructor() !== null,
    );
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const onTranscriptRef = useRef(options.onTranscript);
    useLayoutEffect(() => {
        onTranscriptRef.current = options.onTranscript;
    });

    useEffect(() => {
        return () => {
            recognitionRef.current?.abort();
        };
    }, []);

    const toggleVoiceInput = (): void => {
        const Recognition = getSpeechRecognitionConstructor();

        if (!Recognition) {
            toast.error(t('ai.dictationUnsupported'));

            return;
        }

        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);

            return;
        }

        const recognition = new Recognition();
        recognition.lang = speechRecognitionLang(i18n.language);
        recognition.continuous = false;
        recognition.interimResults = false;
        recognitionRef.current = recognition;

        recognition.addEventListener('result', (event) => {
            let transcript = '';

            for (
                let index = event.resultIndex;
                index < event.results.length;
                index++
            ) {
                const result = event.results[index];

                if (result?.isFinal) {
                    transcript += result[0]?.transcript ?? '';
                }
            }

            if (transcript.trim() !== '') {
                onTranscriptRef.current(transcript.trim());
            }
        });

        recognition.addEventListener('error', () => {
            setIsListening(false);
            recognitionRef.current = null;
            toast.error(t('ai.dictationError'));
        });

        recognition.addEventListener('end', () => {
            setIsListening(false);
            recognitionRef.current = null;
        });

        try {
            recognition.start();
            setIsListening(true);
        } catch {
            setIsListening(false);
            toast.error(t('ai.unableStartDictation'));
        }
    };

    return { isListening, speechSupported, toggleVoiceInput };
}
