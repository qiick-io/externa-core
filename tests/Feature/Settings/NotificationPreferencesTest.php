<?php

use App\Models\User;
use App\Services\Settings\SettingsRepositoryService;
use App\Services\Settings\UserNotificationPreferencesService;

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

    $repository = app(SettingsRepositoryService::class);

    expect($repository->get(
        SettingsRepositoryService::SCOPE_USER,
        UserNotificationPreferencesService::GROUP,
        UserNotificationPreferencesService::KEY_SOUND_CHAT,
        $user->id,
    ))->toBeTrue()
        ->and($repository->get(
            SettingsRepositoryService::SCOPE_USER,
            UserNotificationPreferencesService::GROUP,
            UserNotificationPreferencesService::KEY_SOUND_NOTIFICATIONS,
            $user->id,
        ))->toBeTrue();
});

test('notification sound preferences default to off', function () {
    $user = User::factory()->create();

    $shared = app(UserNotificationPreferencesService::class)->shared($user);

    expect($shared)->toBe([
        'sound_chat_enabled' => false,
        'sound_notifications_enabled' => false,
    ]);
});
