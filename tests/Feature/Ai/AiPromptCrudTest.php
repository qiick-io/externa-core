<?php

use App\Enums\PermissionEnum;
use App\Models\AiPrompt;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('can-use-ai users can list prompts but cannot manage without ai.prompts.manage', function () {
    $prompt = AiPrompt::factory()->create([
        'name' => 'Brand voice',
        'body' => 'Keep answers short.',
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->getJson(route('ai.prompts.index'))
        ->assertOk()
        ->assertJsonPath('can_manage', false)
        ->assertJsonFragment(['id' => $prompt->id, 'name' => 'Brand voice']);

    $this->postJson(route('ai.prompts.store'), [
        'name' => 'New prompt',
        'body' => 'Do not create this.',
    ])->assertForbidden();

    $this->putJson(route('ai.prompts.update', $prompt), [
        'name' => 'Hacked',
        'body' => 'Nope',
    ])->assertForbidden();

    $this->deleteJson(route('ai.prompts.destroy', $prompt))
        ->assertForbidden();

    expect(AiPrompt::query()->find($prompt->id))->not->toBeNull()
        ->and(AiPrompt::query()->where('name', 'New prompt')->exists())->toBeFalse();
});

test('ai.prompts.manage allows create update and delete', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanManageAiPrompts->value,
    ]);
    $this->actingAs($user);

    $created = $this->postJson(route('ai.prompts.store'), [
        'name' => 'SEO checklist',
        'description' => 'When editing articles',
        'body' => 'Check title, description, and slug.',
    ]);

    $created->assertCreated()
        ->assertJsonPath('prompt.name', 'SEO checklist');

    $promptId = (int) $created->json('prompt.id');

    $this->putJson(route('ai.prompts.update', $promptId), [
        'name' => 'SEO checklist v2',
        'body' => 'Also verify og:image.',
    ])->assertOk()
        ->assertJsonPath('prompt.name', 'SEO checklist v2')
        ->assertJsonPath('prompt.body', 'Also verify og:image.');

    $this->getJson(route('ai.prompts.index'))
        ->assertOk()
        ->assertJsonPath('can_manage', true)
        ->assertJsonFragment(['id' => $promptId, 'name' => 'SEO checklist v2']);

    $this->deleteJson(route('ai.prompts.destroy', $promptId))
        ->assertOk()
        ->assertJsonPath('ok', true);

    expect(AiPrompt::query()->find($promptId))->toBeNull();
});

test('prompt routes require can-use-ai', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->getJson(route('ai.prompts.index'))->assertForbidden();
});
