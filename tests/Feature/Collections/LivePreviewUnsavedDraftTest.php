<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\LivePreviewTokenService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Testing\TestResponse;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * Collection with a Live Preview template and `title` (required) + `notes` string fields.
 */
function unsavedPreviewCollection(string $slug = 'posts'): Collection
{
    $collection = Collection::factory()->create([
        'slug' => $slug,
        'versioning' => true,
        'preview_url' => 'https://front.test/p/{{collection}}/{{id}}?v={{version}}&token={{token}}',
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => true],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
    ]);

    return $collection->fresh(['fields']);
}

function unsavedPreviewEditor(): User
{
    $user = User::factory()->create();
    // Spatie-only users need can-edit too: CollectionPolicy::createItems falls back to it.
    $user->givePermissionTo([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);

    return $user;
}

/**
 * The `token` query value of a built preview URL.
 */
function unsavedPreviewToken(TestResponse $response): string
{
    parse_str((string) parse_url((string) $response->json('url'), PHP_URL_QUERY), $query);

    return (string) $query['token'];
}

function getUnsavedPreview(string $token): TestResponse
{
    return test()->getJson('/api/v1/preview?token='.urlencode($token));
}

test('create form preview resolves the unsaved payload like a draft item without creating a row', function () {
    $collection = unsavedPreviewCollection();
    $user = unsavedPreviewEditor();

    $response = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => 'Unsaved title', 'notes' => 'Draft notes'],
        ])
        ->assertOk()
        ->assertJsonPath('as_of', null);

    expect($response->json('url'))->toStartWith('https://front.test/p/posts/?')
        ->and($response->json('url'))->toContain('v=draft')
        ->and(CollectionItem::query()->count())->toBe(0);

    getUnsavedPreview(unsavedPreviewToken($response))
        ->assertOk()
        ->assertJsonPath('data.id', null)
        ->assertJsonPath('data.collection_id', $collection->id)
        ->assertJsonPath('data.data.title', 'Unsaved title')
        ->assertJsonPath('data.data.notes', 'Draft notes')
        ->assertJsonPath('meta.preview', true)
        ->assertJsonPath('meta.version', 'draft')
        ->assertJsonPath('meta.unsaved', true);

    expect(CollectionItem::query()->count())->toBe(0);
});

test('create form preview keeps the create save rules except presence', function () {
    $collection = unsavedPreviewCollection();
    $user = unsavedPreviewEditor();

    $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['notes' => 'No title'],
        ])
        ->assertOk();

    $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => 'Ok', 'unknown_field' => 'x'],
        ])
        ->assertUnprocessable();

    $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => ['not', 'a', 'string']],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('data.title');

    // The real save still enforces the required title.
    $this->actingAs($user)
        ->post(route('collections.items.store', $collection), ['data' => ['notes' => 'No title']])
        ->assertSessionHasErrors('data.title');

    expect(CollectionItem::query()->count())->toBe(0);
});

test('create form preview with empty required fields resolves', function () {
    $collection = unsavedPreviewCollection();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'code',
        'type' => FieldTypeEnum::String,
        'settings' => ['validation_rules' => [
            ['operator' => 'required'],
            ['operator' => 'max_length', 'value' => 5],
        ]],
    ]);
    $collection = $collection->fresh(['fields']);
    $user = unsavedPreviewEditor();

    $response = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => '', 'notes' => 'Only notes so far'],
        ])
        ->assertOk();

    $data = getUnsavedPreview(unsavedPreviewToken($response))
        ->assertOk()
        ->assertJsonPath('data.data.notes', 'Only notes so far')
        ->json('data.data');

    expect($data['title'] ?? null)->toBeNull()
        ->and($data)->not->toHaveKey('code')
        ->and(CollectionItem::query()->count())->toBe(0);

    $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['code' => 'too-long-code'],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('data.code');
});

test('create form preview needs a configured preview url', function () {
    $collection = unsavedPreviewCollection();
    $collection->update(['preview_url' => null]);

    $this->actingAs(unsavedPreviewEditor())
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => 'Ok'],
        ])
        ->assertUnprocessable();
});

test('create form preview is forbidden without the create ability', function () {
    $collection = unsavedPreviewCollection();

    $viewer = User::factory()->create();
    $viewer->givePermissionTo(PermissionEnum::CanShowCollections->value);

    $this->actingAs($viewer)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => 'Ok'],
        ])
        ->assertForbidden();

    // Spatie permission present, but the collection ACL grants Read only (CollectionPolicy::createItems).
    $role = Role::query()->create(['name' => 'lp-unsaved-reader', 'guard_name' => 'web']);
    $role->syncPermissions([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    CollectionPermission::query()->create([
        'role_id' => $role->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionActionEnum::Read->value,
        'allowed' => true,
    ]);
    app(CollectionPermissionGuardService::class)->forget($role->id);
    $aclReader = User::factory()->create();
    $aclReader->syncRoles([$role]);

    $this->actingAs($aclReader)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), [
            'data' => ['title' => 'Ok'],
        ])
        ->assertForbidden();
});

test('create form preview strips fields the editor cannot create or read', function () {
    $collection = unsavedPreviewCollection();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'internal',
        'type' => FieldTypeEnum::String,
    ]);

    $role = Role::query()->create(['name' => 'lp-unsaved-restricted', 'guard_name' => 'web']);
    $role->syncPermissions([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $fieldRules = ['fields' => [
        'title' => ['read' => true, 'create' => true, 'update' => true],
        'notes' => ['read' => true, 'create' => false, 'update' => false],
        'internal' => ['read' => false, 'create' => true, 'update' => true],
    ]];
    foreach ([CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Create] as $action) {
        CollectionPermission::query()->create([
            'role_id' => $role->id,
            'collection_id' => $collection->id,
            'action' => $action->value,
            'allowed' => true,
            'rules' => $fieldRules,
        ]);
    }
    app(CollectionPermissionGuardService::class)->forget($role->id);
    $user = User::factory()->create();
    $user->syncRoles([$role]);

    $response = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection->fresh(['fields'])), [
            'data' => ['title' => 'Visible', 'notes' => 'NOT-WRITABLE', 'internal' => 'NOT-READABLE'],
        ])
        ->assertOk();

    $data = getUnsavedPreview(unsavedPreviewToken($response))
        ->assertOk()
        ->json('data.data');

    expect($data)->toHaveKey('title')
        ->and($data)->not->toHaveKey('notes')
        ->and($data)->not->toHaveKey('internal')
        ->and(json_encode($data))->not->toContain('NOT-');
});

test('unsaved preview tokens are rejected when expired, tampered, foreign or replaced', function () {
    $collection = unsavedPreviewCollection();
    $otherCollection = unsavedPreviewCollection('pages');
    $user = unsavedPreviewEditor();

    $first = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), ['data' => ['title' => 'First']])
        ->assertOk();
    $firstToken = unsavedPreviewToken($first);
    $firstClaims = app(LivePreviewTokenService::class)->verify($firstToken);

    expect($firstClaims)->toMatchArray([
        'collection_id' => $collection->id,
        'item_id' => null,
        'version' => 'draft',
        'user_id' => $user->id,
    ]);

    getUnsavedPreview(substr($firstToken, 0, -4).'xxxx')
        ->assertForbidden()
        ->assertJsonPath('message', 'Invalid or expired preview token.');

    $foreignToken = app(LivePreviewTokenService::class)->mintUnsavedDraft(
        $otherCollection->id,
        (string) $firstClaims['unsaved_draft_id'],
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
    );
    getUnsavedPreview($foreignToken)->assertForbidden();

    $second = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), ['data' => ['title' => 'Second']])
        ->assertOk();
    getUnsavedPreview($firstToken)->assertForbidden();
    getUnsavedPreview(unsavedPreviewToken($second))->assertOk()->assertJsonPath('data.data.title', 'Second');

    $this->travel(LivePreviewUrlBuilderService::TTL_SECONDS + 1)->seconds();
    getUnsavedPreview(unsavedPreviewToken($second))
        ->assertForbidden()
        ->assertJsonPath('message', 'Invalid or expired preview token.');
});

test('unsaved preview token is revoked after the item is saved', function () {
    $collection = unsavedPreviewCollection();
    $user = unsavedPreviewEditor();

    $response = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), ['data' => ['title' => 'Before save']])
        ->assertOk();
    $token = unsavedPreviewToken($response);
    getUnsavedPreview($token)->assertOk();

    $this->actingAs($user)
        ->post(route('collections.items.store', $collection), ['data' => ['title' => 'Saved']])
        ->assertRedirect();

    expect(CollectionItem::query()->count())->toBe(1);
    getUnsavedPreview($token)->assertForbidden();
});

test('unsaved preview token is revoked when the create form is left', function () {
    $collection = unsavedPreviewCollection();
    $user = unsavedPreviewEditor();

    $response = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), ['data' => ['title' => 'Cancelled']])
        ->assertOk();

    $this->actingAs($user)
        ->deleteJson(route('collections.items.live-preview-draft.destroy', $collection))
        ->assertNoContent();

    getUnsavedPreview(unsavedPreviewToken($response))->assertForbidden();
});

test('unsaved preview token stops working once the editor loses the create grant', function () {
    $collection = unsavedPreviewCollection();
    $user = unsavedPreviewEditor();

    $response = $this->actingAs($user)
        ->postJson(route('collections.items.live-preview-draft.store', $collection), ['data' => ['title' => 'Ok']])
        ->assertOk();

    $user->revokePermissionTo(PermissionEnum::CanCreateCollections->value);
    app(EffectivePermissionResolverService::class)->forget($user);

    getUnsavedPreview(unsavedPreviewToken($response))->assertForbidden();
});
