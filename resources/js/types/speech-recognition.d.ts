/** Minimal Web Speech API typings (Chrome / Safari webkit). */

interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognitionEventMap {
    result: SpeechRecognitionEvent;
    error: SpeechRecognitionErrorEvent;
    end: Event;
    start: Event;
}

interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    addEventListener<K extends keyof SpeechRecognitionEventMap>(
        type: K,
        listener: (event: SpeechRecognitionEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof SpeechRecognitionEventMap>(
        type: K,
        listener: (event: SpeechRecognitionEventMap[K]) => void,
        options?: boolean | EventListenerOptions,
    ): void;
}

interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
}

interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
