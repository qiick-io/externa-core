import assert from 'node:assert/strict';
import test from 'node:test';
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

    assert.equal(getNotificationSoundPrefs().sound_chat_enabled, false);
    assert.equal(shouldPlayChatSound(), false);
    assert.equal(shouldPlayChatSoundOnUnreadIncrease(0, 1), false);
});

test('chat sound plays on unread increase when enabled and unlocked', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: false,
    });

    assert.equal(shouldPlayChatSoundOnUnreadIncrease(0, 2), false);

    markNotificationSoundUnlockedForTests();

    assert.equal(shouldPlayChatSound(), true);
    assert.equal(shouldPlayChatSoundOnUnreadIncrease(0, 2), true);
    assert.equal(shouldPlayChatSoundOnUnreadIncrease(2, 2), false);
});

test('chat sound ignores unread decrease', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: false,
    });
    markNotificationSoundUnlockedForTests();

    assert.equal(shouldPlayChatSoundOnUnreadIncrease(3, 1), false);
});

test('notification sound respects toggle', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: false,
        sound_notifications_enabled: true,
    });
    markNotificationSoundUnlockedForTests();

    assert.equal(shouldPlayChatSound(), false);
    assert.equal(shouldPlayNotificationSound(), true);
});

test('disabled notification toggle blocks sound even when unlocked', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();
    markNotificationSoundUnlockedForTests();

    setNotificationSoundPrefs({
        sound_chat_enabled: false,
        sound_notifications_enabled: false,
    });

    assert.equal(shouldPlayNotificationSound(), false);
    assert.equal(shouldPlayChatSound(), false);
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
    assert.equal(shouldPlayChatSoundOnUnreadIncrease(0, 1), true);
    assert.equal(shouldPlayChatSoundOnUnreadIncrease(1, 1), false);
    assert.equal(shouldPlayNotificationSound(), true);
});

test('play_sound flag beeps for viewers even when unread flat', () => {
    mockVisibleTab();
    resetNotificationSoundForTests();
    setNotificationSoundPrefs({
        sound_chat_enabled: true,
        sound_notifications_enabled: false,
    });
    markNotificationSoundUnlockedForTests();

    assert.equal(shouldPlayChatSoundForUnreadEvent(0, 0, true), true);
    assert.equal(shouldPlayChatSoundForUnreadEvent(0, 0, false), false);
    assert.equal(shouldPlayChatSoundForUnreadEvent(0, 1, false), true);
});
