<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Editor flow end to end on a versioned collection: create an item through the
 * admin form with the common field types (the create form was read-only on
 * versioned collections), reopen it, edit it as a draft, and check the public
 * REST and GraphQL APIs keep serving the published values, not the draft.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->collection = Collection::factory()->create([
        'name' => 'Flow Posts',
        'slug' => 'flow-posts',
        'is_singleton' => false,
        'versioning' => true,
    ]);

    foreach ([
        ['title', FieldTypeEnum::String, null],
        ['summary', FieldTypeEnum::Textarea, null],
        ['count', FieldTypeEnum::Number, null],
        ['featured', FieldTypeEnum::Boolean, null],
        ['status', FieldTypeEnum::Select, ['options' => [['value' => 'draft', 'label' => 'Draft'], ['value' => 'live', 'label' => 'Live']]]],
    ] as [$name, $type, $settings]) {
        CollectionField::factory()->for($this->collection)->create(['name' => $name, 'type' => $type, 'settings' => $settings]);
    }

    $publicRole = Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
    CollectionPermission::query()->updateOrCreate(
        ['role_id' => $publicRole->id, 'collection_id' => $this->collection->id, 'action' => CollectionPermissionActionEnum::Read->value],
        ['allowed' => true, 'rules' => null],
    );
    app(CollectionPermissionGuardService::class)->forget($publicRole->id);
});

it('creates an item, keeps the edit as a draft and serves the published values on the public APIs', function (): void {
    $page = visit(route('collections.items.new', $this->collection, false));

    // Fail fast (instead of waiting on a read-only input) if the create form regresses.
    $page->assertPresent('[data-test="item-save-split"]')
        ->assertScript("document.querySelector('#data_title').readOnly === false");

    $page->fill('#data_title', 'First post')
        ->fill('#data_summary', 'Short summary')
        ->fill('#data_count', '7')
        ->click('#data_featured')
        ->click('#data_status')
        ->click('[role="option"]:has-text("Live")')
        ->click('[data-test="item-save-split"] button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    $item = CollectionItem::query()->where('collection_id', $this->collection->id)->sole();

    visit(route('collections.items.show', [$this->collection, $item], false))
        ->assertValue('#data_title', 'First post')
        ->assertValue('#data_summary', 'Short summary')
        ->assertValue('#data_count', '7')
        ->assertAttribute('#data_featured', 'aria-checked', 'true')
        ->assertSeeIn('#data_status', 'Live')
        ->fill('#data_title', 'First post, edited')
        ->click('[data-test="item-save-split"] button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    expect($item->fresh()->draft_data)->toMatchArray(['title' => 'First post, edited']);

    $rest = $this->getJson("/api/v1/collections/flow-posts/items/{$item->id}")->assertOk();

    expect($rest->json('data.data'))->toMatchArray([
        'title' => 'First post',
        'summary' => 'Short summary',
        'count' => 7,
        'featured' => true,
        'status' => 'live',
    ]);

    $graphql = $this->postJson('/api/graphql', [
        'query' => 'query ($id: ID!) { item(collection: "flow-posts", id: $id) { id data updated_at } }',
        'variables' => ['id' => (string) $item->id],
    ])->assertOk();

    expect($graphql->json('errors'))->toBeNull()
        ->and($graphql->json('data.item.data.title'))->toBe('First post')
        ->and($graphql->json('data.item.data.status'))->toBe('live');
});
