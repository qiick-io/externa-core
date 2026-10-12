<?php

use App\Ai\Agents\ContentTranslator;
use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('translate fields requires authentication', function () {
    $this->postJson(route('ai.translate-fields'), [
        'source_locale' => 'it',
        'target_locale' => 'en',
        'fields' => ['title' => 'Ciao'],
    ])->assertUnauthorized();
});

test('translate fields requires can-use-ai permission', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->postJson(route('ai.translate-fields'), [
        'source_locale' => 'it',
        'target_locale' => 'en',
        'fields' => ['title' => 'Ciao'],
    ])->assertForbidden();
});

test('translate fields returns mapped translations when agent is faked', function () {
    ContentTranslator::fake([
        json_encode([
            'fields' => [
                'title' => 'Hello',
                'body' => 'World',
            ],
        ], JSON_THROW_ON_ERROR),
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->postJson(route('ai.translate-fields'), [
        'source_locale' => 'it',
        'target_locale' => 'en',
        'fields' => [
            'title' => 'Ciao',
            'body' => 'Mondo',
        ],
    ])
        ->assertOk()
        ->assertJson([
            'fields' => [
                'title' => 'Hello',
                'body' => 'World',
            ],
        ]);

    ContentTranslator::assertPrompted(
        fn ($prompt): bool => str_contains((string) $prompt->prompt, '"title":"Ciao"'),
    );
});

test('translate fields rejects same source and target locale', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->postJson(route('ai.translate-fields'), [
        'source_locale' => 'en',
        'target_locale' => 'en',
        'fields' => ['title' => 'Hello'],
    ])->assertUnprocessable();
});
