import { expect, test } from 'vitest';
import {
    getNotificationSoundPrefs,
    markNotificationSoundUnlockedForTests,
    resetNotificationSoundForTests,
    setNotificationSoundPrefs,
    shouldPlayChatSound,
    shouldPlayChatSoundForUnreadEvent,
    shouldPlayChatSoundOnUnreadIncrease,
    shouldPlayNotificationSound,
} from './notification-sound.ts';

function mockVisibleTab(): void {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: {
            document: { visibilityState: 'visible' },
            AudioContext: undefined,
            matchMedia: () => ({ matches: false }),
        },
    });
}

test('chat sound stays off by default', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    expect(getNotificationSoundPrefs().sound_chat_enabled).toBe(false);
    expect(shouldPlayChatSound()).toBe(false);
    expect(shouldPlayChatSoundOnUnreadIncrease(0, 1)).toBe(false);
});

test('chat sound plays on unread increase when enabled and unlocked', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: false,
    });

    expect(shouldPlayChatSoundOnUnreadIncrease(0, 2)).toBe(false);

    markNotificationSoundUnlockedForTests();

    expect(shouldPlayChatSound()).toBe(true);
    expect(shouldPlayChatSoundOnUnreadIncrease(0, 2)).toBe(true);
    expect(shouldPlayChatSoundOnUnreadIncrease(2, 2)).toBe(false);
});

test('chat sound ignores unread decrease', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: false,
    });
    markNotificationSoundUnlockedForTests();

    expect(shouldPlayChatSoundOnUnreadIncrease(3, 1)).toBe(false);
});

test('notification sound respects toggle', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: false,
        sound_notifications_enabled: true,
    });
    markNotificationSoundUnlockedForTests();

    expect(shouldPlayChatSound()).toBe(false);
    expect(shouldPlayNotificationSound()).toBe(true);
});

test('disabled notification toggle blocks sound even when unlocked', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();
    markNotificationSoundUnlockedForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: false,
        sound_notifications_enabled: false,
    });

    expect(shouldPlayNotificationSound()).toBe(false);
    expect(shouldPlayChatSound()).toBe(false);
});

test('unread increase gate matches live chat path', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();
    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: true,
    });
    markNotificationSoundUnlockedForTests();

    // Same predicate use-chat-unread uses before playChatSound().
    expect(shouldPlayChatSoundOnUnreadIncrease(0, 1)).toBe(true);
    expect(shouldPlayChatSoundOnUnreadIncrease(1, 1)).toBe(false);
    expect(shouldPlayNotificationSound()).toBe(true);
});

test('play_sound flag beeps for viewers even when unread flat', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();
    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: false,
    });
    markNotificationSoundUnlockedForTests();

    expect(shouldPlayChatSoundForUnreadEvent(0, 0, true)).toBe(true);
    expect(shouldPlayChatSoundForUnreadEvent(0, 0, false)).toBe(false);
    expect(shouldPlayChatSoundForUnreadEvent(0, 1, false)).toBe(true);
});
