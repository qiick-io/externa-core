<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Collections\LivePreviewToken;
use App\Services\Collections\LivePreviewUrlBuilder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
});

function lpPublic(): Role
{
    return Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
}

function lpGrant(Collection $collection, Role $role, array $actions, ?array $rules = null): void
{
    foreach ($actions as $action) {
        $value = $action instanceof CollectionPermissionActionEnum ? $action->value : $action;
        CollectionPermission::query()->updateOrCreate(
            ['role_id' => $role->id, 'collection_id' => $collection->id, 'action' => $value],
            ['allowed' => true, 'rules' => $rules],
        );
    }
    app(CollectionPermissionGuard::class)->forget($role->id);
}

function lpSync(CollectionItem $item, Collection $collection, array $data): void
{
    $n = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, true);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $n);
}

/**
 * @return array{user: User, role: Role}
 */
function lpRestrictedUser(Collection $collection, array $rules): array
{
    $role = Role::query()->create([
        'name' => 'lp-restricted-'.uniqid(),
        'guard_name' => 'web',
    ]);
    $role->syncPermissions([PermissionEnum::CanShowCollections->value]);
    lpGrant($collection, $role, [CollectionPermissionActionEnum::Read], $rules);
    $user = User::factory()->create();
    $user->syncRoles([$role]);

    return compact('user', 'role');
}

function lpTokenFor(User $user, Collection $collection, CollectionItem $item, string $version): string
{
    return app(LivePreviewToken::class)->mint(
        (int) $collection->id,
        (int) $item->id,
        $version,
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilder::class)->contentHash($item, $version),
    );
}

test('POC3 field-restricted editor preview strips unreadable fields on draft and published', function () {
    $collection = Collection::factory()->create(['versioning' => true, 'slug' => 'posts-lp']);
    foreach (['title', 'internal_notes'] as $f) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => $f,
            'type' => FieldTypeEnum::String,
        ]);
    }
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'draft_data' => ['title' => 'Draft', 'internal_notes' => 'SECRET-DRAFT'],
    ]);
    lpSync($item, $collection->fresh('fields'), [
        'title' => 'Pub',
        'internal_notes' => 'SECRET-PUB',
    ]);

    ['user' => $user] = lpRestrictedUser($collection, [
        'fields' => [
            'title' => ['read' => true, 'create' => false, 'update' => false],
            'internal_notes' => ['read' => false, 'create' => false, 'update' => false],
        ],
    ]);

    foreach (['draft', 'published'] as $version) {
        $token = lpTokenFor($user, $collection, $item, $version);

        $data = $this->getJson('/api/v1/preview?token='.urlencode($token))
            ->assertOk()
            ->json('data.data');

        expect($data)->toHaveKey('title')
            ->and($data)->not->toHaveKey('internal_notes')
            ->and(json_encode($data))->not->toContain('SECRET');
    }
});

test('preview enforces item_filter and collection Read for bound user', function () {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'lp-filter',
        'is_singleton' => false,
        'sort_order' => 1,
        'versioning' => true,
        'preview_url' => 'https://front.test/p/{{id}}?token={{token}}',
    ]);
    foreach (['title', 'status', 'secret'] as $n) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => $n,
            'type' => FieldTypeEnum::String,
        ]);
    }

    $rules = [
        'fields' => [
            'title' => ['read' => true, 'create' => false, 'update' => false],
            'status' => ['read' => true, 'create' => false, 'update' => false],
            'secret' => ['read' => false, 'create' => false, 'update' => false],
        ],
        'item_filter' => [
            'logic' => 'and',
            'rules' => [['field' => 'status', 'operator' => 'equals', 'value' => 'published']],
        ],
    ];
    ['user' => $user, 'role' => $role] = lpRestrictedUser($collection, $rules);

    $visible = $collection->items()->create([]);
    lpSync($visible, $collection->fresh(['fields']), [
        'title' => 'Vis',
        'status' => 'published',
        'secret' => 'S-VIS',
    ]);
    $hidden = $collection->items()->create([]);
    lpSync($hidden, $collection->fresh(['fields']), [
        'title' => 'Hid',
        'status' => 'draft',
        'secret' => 'S-HID',
    ]);
    $hidden->update([
        'draft_data' => ['title' => 'HidDraft', 'status' => 'draft', 'secret' => 'S-HID-DRAFT'],
    ]);

    // Filter-hidden item → 404 for published and draft (even with a minted token)
    foreach (['published', 'draft'] as $version) {
        $token = lpTokenFor($user, $collection, $hidden, $version);
        $this->getJson('/api/v1/preview?token='.urlencode($token))->assertNotFound();
    }

    // Visible item strips secret
    $token = lpTokenFor($user, $collection, $visible, 'published');
    $this->getJson('/api/v1/preview?token='.urlencode($token))
        ->assertOk()
        ->assertJsonMissingPath('data.data.secret');

    // Revoke Read but keep Update so the role stays in ACL mode → 403
    CollectionPermission::query()->updateOrCreate(
        [
            'role_id' => $role->id,
            'collection_id' => $collection->id,
            'action' => CollectionPermissionActionEnum::Update->value,
        ],
        ['allowed' => true, 'rules' => $rules],
    );
    CollectionPermission::query()
        ->where('role_id', $role->id)
        ->where('collection_id', $collection->id)
        ->where('action', CollectionPermissionActionEnum::Read->value)
        ->delete();
    app(CollectionPermissionGuard::class)->forget($role->id);

    $this->getJson('/api/v1/preview?token='.urlencode($token))->assertForbidden();
});

test('published preview include does not hydrate unreadable related collection', function () {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'lp-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'ssn',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    lpSync($author, $authors->fresh(['fields']), [
        'name' => 'Hidden Author',
        'ssn' => 'CROSS-SECRET',
    ]);

    $posts = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'lp-posts',
        'is_singleton' => false,
        'sort_order' => 1,
        'preview_url' => 'https://front.test/p/{{id}}?token={{token}}',
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $post = $posts->items()->create([]);
    lpSync($post, $posts->fresh(['fields']), [
        'title' => 'Hello',
        'author' => $author->id,
    ]);

    ['user' => $user] = lpRestrictedUser($posts, [
        'fields' => [
            'title' => ['read' => true, 'create' => false, 'update' => false],
            'author' => ['read' => true, 'create' => false, 'update' => false],
        ],
    ]);
    // No Read on authors for this role.

    $token = lpTokenFor($user, $posts, $post, 'published');

    $prev = $this->getJson('/api/v1/preview?token='.urlencode($token).'&include=author')
        ->assertOk();
    expect($prev->json('data.data.author'))->toBe($author->id)
        ->and(json_encode($prev->json()))->not->toContain('Hidden Author')
        ->and(json_encode($prev->json()))->not->toContain('CROSS-SECRET');

    // Draft + include stays raw id (no hydrate)
    $posts->update(['versioning' => true]);
    $post->update(['draft_data' => ['title' => 'DraftHello', 'author' => $author->id]]);
    $tokenD = lpTokenFor($user, $posts, $post, 'draft');
    $draftPrev = $this->getJson('/api/v1/preview?token='.urlencode($tokenD).'&include=author')
        ->assertOk();
    expect($draftPrev->json('data.data.author'))->toBe($author->id);
});

test('preview token bindings ttl reuse and rejection cases', function () {
    $c1 = Collection::query()->create([
        'name' => 'C1',
        'slug' => 'lp-c1',
        'is_singleton' => false,
        'sort_order' => 1,
        'versioning' => true,
        'preview_url' => 'https://front.test/p/{{id}}?token={{token}}',
    ]);
    $c2 = Collection::query()->create([
        'name' => 'C2',
        'slug' => 'lp-c2',
        'is_singleton' => false,
        'sort_order' => 1,
        'versioning' => true,
    ]);
    foreach ([$c1, $c2] as $c) {
        CollectionField::factory()->create([
            'collection_id' => $c->id,
            'name' => 'title',
            'type' => FieldTypeEnum::String,
        ]);
    }
    $a = $c1->items()->create([]);
    lpSync($a, $c1->fresh(['fields']), ['title' => 'ItemA']);
    $a->update(['draft_data' => ['title' => 'ItemA-DRAFT']]);
    $b = $c1->items()->create([]);
    lpSync($b, $c1->fresh(['fields']), ['title' => 'ItemB']);
    $b->update(['draft_data' => ['title' => 'ItemB-DRAFT']]);

    $user = User::factory()->create();
    $user->givePermissionTo(PermissionEnum::CanShowCollections->value);

    expect(LivePreviewUrlBuilder::TTL_SECONDS)->toBe(300);

    $tokens = app(LivePreviewToken::class);
    $ttl = LivePreviewUrlBuilder::TTL_SECONDS;
    $tokA = $tokens->mint(
        $c1->id,
        $a->id,
        'published',
        null,
        now()->addSeconds($ttl)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilder::class)->contentHash($a, 'published'),
    );
    $claims = $tokens->verify($tokA);
    expect($claims)->toMatchArray([
        'collection_id' => $c1->id,
        'item_id' => $a->id,
        'version' => 'published',
        'locale' => null,
        'user_id' => (int) $user->id,
    ])->and($claims)->toHaveKey('content_hash');

    $this->getJson('/api/v1/preview?token='.urlencode($tokA))->assertOk()->assertJsonPath('data.data.title', 'ItemA');
    $this->getJson('/api/v1/preview?token='.urlencode($tokA))->assertOk()->assertJsonPath('data.data.title', 'ItemA');

    $rB = $this->getJson('/api/v1/preview?token='.urlencode($tokA).'&item_id='.$b->id.'&collection_id='.$c2->id);
    $rB->assertOk();
    expect($rB->json('data.data.title'))->toBe('ItemA')->and($rB->json('data.id'))->toBe($a->id);

    $tokDraft = $tokens->mint(
        $c1->id,
        $a->id,
        'draft',
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilder::class)->contentHash($a, 'draft'),
    );
    $rMode = $this->getJson('/api/v1/preview?token='.urlencode($tokDraft).'&version=published')->assertOk();
    expect($rMode->json('meta.version'))->toBe('draft')
        ->and($rMode->json('data.data.title'))->toBe('ItemA-DRAFT');

    $expired = $tokens->mint(
        $c1->id,
        $a->id,
        'published',
        null,
        now()->subSecond()->getTimestamp(),
        (int) $user->id,
    );
    $this->getJson('/api/v1/preview?token='.urlencode($expired))->assertForbidden();

    $parts = explode('.', $tokA, 2);
    $json = json_decode(base64_decode(strtr($parts[0], '-_', '+/')), true);
    $json['i'] = $b->id;
    $tampered = rtrim(strtr(base64_encode(json_encode($json)), '+/', '-_'), '=').'.'.$parts[1];
    $this->getJson('/api/v1/preview?token='.urlencode($tampered))->assertForbidden();

    // Token without u
    $legacy = [
        'c' => $c1->id,
        'i' => $a->id,
        'v' => 'published',
        'l' => null,
        'exp' => now()->addMinutes(5)->getTimestamp(),
    ];
    $body = rtrim(strtr(base64_encode(json_encode($legacy)), '+/', '-_'), '=');
    $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, (string) config('app.key'), true)), '+/', '-_'), '=');
    $this->getJson('/api/v1/preview?token='.urlencode($body.'.'.$sig))->assertForbidden();

    // Deactivated user
    $tokActive = $tokens->mint(
        $c1->id,
        $a->id,
        'published',
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilder::class)->contentHash($a, 'published'),
    );
    $user->update(['is_active' => false]);
    $this->getJson('/api/v1/preview?token='.urlencode($tokActive))->assertForbidden();
});
