<?php

use App\Models\User;
use App\Services\Settings\SettingsRepository;
use App\Services\Settings\UserNotificationPreferences;

test('profile page includes notification sound preferences', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('profile.edit'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('notificationSounds')
            ->where('notificationSounds.sound_chat_enabled', false)
            ->where('notificationSounds.sound_notifications_enabled', false));
});

test('user can enable notification sound preferences', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patch(route('notification-preferences.update'), [
            'sound_chat_enabled' => true,
            'sound_notifications_enabled' => true,
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('profile.edit'));

    $repository = app(SettingsRepository::class);

    expect($repository->get(
        SettingsRepository::SCOPE_USER,
        UserNotificationPreferences::GROUP,
        UserNotificationPreferences::KEY_SOUND_CHAT,
        $user->id,
    ))->toBeTrue()
        ->and($repository->get(
            SettingsRepository::SCOPE_USER,
            UserNotificationPreferences::GROUP,
            UserNotificationPreferences::KEY_SOUND_NOTIFICATIONS,
            $user->id,
        ))->toBeTrue();
});

test('notification sound preferences default to off', function () {
    $user = User::factory()->create();

    $shared = app(UserNotificationPreferences::class)->shared($user);

    expect($shared)->toBe([
        'sound_chat_enabled' => false,
        'sound_notifications_enabled' => false,
    ]);
});
