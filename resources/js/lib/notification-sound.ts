export type NotificationSoundPrefs = {
    sound_chat_enabled: boolean;
    sound_notifications_enabled: boolean;
};

const DEFAULT_PREFS: NotificationSoundPrefs = {
    sound_chat_enabled: false,
    sound_notifications_enabled: false,
};

let prefs: NotificationSoundPrefs = { ...DEFAULT_PREFS };
let audioContext: AudioContext | null = null;
let unlocked = false;
let unlockListenersAttached = false;

function browserWindow(): (Window & typeof globalThis) | null {
    return typeof window === 'undefined' ? null : window;
}

export function setNotificationSoundPrefs(
    next: NotificationSoundPrefs,
): void {
    prefs = { ...next };
}

export function getNotificationSoundPrefs(): NotificationSoundPrefs {
    return { ...prefs };
}

export function isVisibleTab(): boolean {
    const win = browserWindow();

    if (!win) {
        return false;
    }

    return win.document.visibilityState === 'visible';
}

export function isNotificationSoundUnlocked(): boolean {
    return unlocked;
}

function ensureAudioContext(): AudioContext | null {
    const win = browserWindow();

    if (!win) {
        return null;
    }

    const Ctx =
        win.AudioContext ??
        (win as typeof win & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

    if (!Ctx) {
        return null;
    }

    if (!audioContext) {
        audioContext = new Ctx();
    }

    return audioContext;
}

function markRunningIfPossible(ctx: AudioContext): void {
    if (ctx.state === 'running') {
        unlocked = true;
    }
}

/**
 * Resume AudioContext after a user gesture (browser autoplay policy).
 * Safe to call repeatedly — also re-resumes after auto-suspend.
 */
export function unlockNotificationSound(): void {
    const ctx = ensureAudioContext();

    if (!ctx) {
        return;
    }

    if (ctx.state === 'running') {
        unlocked = true;

        return;
    }

    if (ctx.state === 'suspended') {
        void ctx.resume().then(() => {
            markRunningIfPossible(ctx);
        });
    }
}

export function attachNotificationSoundUnlockListeners(): () => void {
    const win = browserWindow();

    if (!win || unlockListenersAttached) {
        return () => undefined;
    }

    unlockListenersAttached = true;

    const onGesture = (): void => {
        unlockNotificationSound();
    };

    // Broad gesture coverage — first interaction unlocks; later ones re-resume.
    win.document.addEventListener('pointerdown', onGesture, { passive: true });
    win.document.addEventListener('keydown', onGesture);
    win.document.addEventListener('touchstart', onGesture, { passive: true });
    win.document.addEventListener('click', onGesture, { passive: true });

    return () => {
        win.document.removeEventListener('pointerdown', onGesture);
        win.document.removeEventListener('keydown', onGesture);
        win.document.removeEventListener('touchstart', onGesture);
        win.document.removeEventListener('click', onGesture);
        unlockListenersAttached = false;
    };
}

export function resetNotificationSoundForTests(): void {
    prefs = { ...DEFAULT_PREFS };
    unlocked = false;
    unlockListenersAttached = false;

    if (audioContext) {
        void audioContext.close();
        audioContext = null;
    }
}

/** Test helper — simulate successful unlock without Web Audio. */
export function markNotificationSoundUnlockedForTests(): void {
    unlocked = true;
}

export function shouldPlayChatSound(): boolean {
    return prefs.sound_chat_enabled && isVisibleTab() && unlocked;
}

export function shouldPlayNotificationSound(): boolean {
    return prefs.sound_notifications_enabled && isVisibleTab() && unlocked;
}

/** Play when unread total rises — server skips viewers, so increase implies other user. */
export function shouldPlayChatSoundOnUnreadIncrease(
    previousUnread: number,
    nextUnread: number,
): boolean {
    return nextUnread > previousUnread && shouldPlayChatSound();
}

/**
 * Live Echo gate: play_sound covers viewers (unread may not rise);
 * unread increase covers recipients when flag absent.
 */
export function shouldPlayChatSoundForUnreadEvent(
    previousUnread: number,
    nextUnread: number,
    playSoundFlag?: boolean,
): boolean {
    return (
        (playSoundFlag === true && shouldPlayChatSound()) ||
        shouldPlayChatSoundOnUnreadIncrease(previousUnread, nextUnread)
    );
}

type SoundSequence = (ctx: AudioContext, startTime: number) => void;

/** Soft marimba-like pop — mallet pitch dip + filtered decay. */
function playPopNow(
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    durationSec: number,
    volume: number,
    options: { body?: boolean } = {},
): void {
    const { body = false } = options;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const tail = durationSec + 0.04;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(body ? 2800 : 2200, startTime);
    filter.frequency.exponentialRampToValueAtTime(700, startTime + durationSec);
    filter.Q.setValueAtTime(0.8, startTime);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * 1.05, startTime);
    osc.frequency.exponentialRampToValueAtTime(frequency, startTime + 0.022);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(volume * 0.35, startTime + 0.028);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    osc.connect(gain);
    gain.connect(filter);

    if (body) {
        const harmonic = ctx.createOscillator();
        const harmonicGain = ctx.createGain();

        harmonic.type = 'triangle';
        harmonic.frequency.setValueAtTime(frequency * 2, startTime);
        harmonicGain.gain.setValueAtTime(0, startTime);
        harmonicGain.gain.linearRampToValueAtTime(volume * 0.18, startTime + 0.004);
        harmonicGain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec * 0.75);

        harmonic.connect(harmonicGain);
        harmonicGain.connect(filter);

        harmonic.start(startTime);
        harmonic.stop(startTime + tail);
    }

    filter.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + tail);
}

const chatSoundSequence: SoundSequence = (ctx, startTime) => {
    // Light single ding — shorter, softer than notification pops.
    playPopNow(ctx, 987.77, startTime, 0.16, 0.09);
};

const notificationSoundSequence: SoundSequence = (ctx, startTime) => {
    // Ascending two-note chime (D5 → G5), ~280ms — Facebook-like pop-pop.
    playPopNow(ctx, 587.33, startTime, 0.13, 0.11, { body: true });
    playPopNow(ctx, 783.99, startTime + 0.11, 0.15, 0.1, { body: true });
};

/**
 * Schedule a sound sequence. Re-resumes if the context auto-suspended after unlock.
 */
function playSoundSequence(sequence: SoundSequence): void {
    const ctx = ensureAudioContext();

    if (!ctx) {
        return;
    }

    const start = (): void => {
        if (ctx.state !== 'running') {
            return;
        }

        unlocked = true;
        sequence(ctx, ctx.currentTime);
    };

    if (ctx.state === 'suspended') {
        void ctx.resume().then(start);

        return;
    }

    start();
}

export function playChatSound(): void {
    if (!shouldPlayChatSound()) {
        return;
    }

    playSoundSequence(chatSoundSequence);
}

export function playNotificationSound(): void {
    if (!shouldPlayNotificationSound()) {
        return;
    }

    playSoundSequence(notificationSoundSequence);
}

/**
 * Unlock + play from a click handler (bypasses prefs/visibility).
 * Use for the Profile "Test sound" control.
 */
export function playTestSound(): void {
    unlockNotificationSound();
    playSoundSequence(chatSoundSequence);
}
