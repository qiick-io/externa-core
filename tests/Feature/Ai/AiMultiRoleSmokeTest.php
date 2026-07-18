<?php

use App\Ai\Agents\AppAssistant;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('super-permission user can open ai page collections and trashed filter', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
        PermissionEnum::CanRestoreCollections->value,
        PermissionEnum::CanForceDeleteCollections->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanShowUsers->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Smoke Active', 'slug' => 'smoke-active']);
    $trashed = Collection::factory()->create(['name' => 'Smoke Trashed', 'slug' => 'smoke-trashed']);
    $trashed->delete();

    $this->get(route('ai.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('ai/index'));

    $this->get(route('collections.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('collections/collections/index')
            ->where('filters.trashed', false)
            ->has('collections', 1)
            ->where('collections.0.id', $collection->id));

    $this->get(route('collections.index', ['trashed' => 1]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('collections/collections/index')
            ->where('filters.trashed', true)
            ->has('collections', 1)
            ->where('collections.0.id', $trashed->id));

    $this->post(route('collections.restore', $trashed))
        ->assertRedirect();

    expect(Collection::query()->find($trashed->id))->not->toBeNull();
});

test('each mutating collection permission alone can open ai but only matching tool family registers', function (string $permission, bool $expectsCollectionTools) {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        $permission,
    ]);
    $this->actingAs($user);

    $this->get(route('ai.index'))->assertOk();
    $this->get(route('ai.status'))->assertOk();

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->all();

    if ($expectsCollectionTools) {
        expect($tools)->toContain('ManageCollections');
    } else {
        expect($tools)->not->toContain('ManageCollections');
    }
})->with([
    'show collections' => [PermissionEnum::CanShowCollections->value, true],
    'create collections' => [PermissionEnum::CanCreateCollections->value, true],
    'edit collections' => [PermissionEnum::CanEditCollections->value, true],
    'delete collections' => [PermissionEnum::CanDeleteCollections->value, true],
    'restore collections' => [PermissionEnum::CanRestoreCollections->value, true],
    'force delete collections' => [PermissionEnum::CanForceDeleteCollections->value, true],
    'show files only' => [PermissionEnum::CanShowFiles->value, false],
    'show users only' => [PermissionEnum::CanShowUsers->value, false],
]);

test('user without can-use-ai cannot hit ai chat or conversations endpoints', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $this->get(route('ai.index'))->assertForbidden();
    $this->get(route('ai.status'))->assertForbidden();
    $this->get(route('ai.conversations.index'))->assertForbidden();
    $this->post(route('ai.chat'), ['message' => 'ciao'])->assertForbidden();
});
