<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\FileAccessEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\File;
use App\Models\FilePermission;
use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\FilePermissionGuard;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('assets');
});

/**
 * @param  list<CollectionPermissionActionEnum|string>  $actions
 * @param  array<string, mixed>|null  $rules
 */
function authzGrant(Role $role, Collection $collection, array $actions, ?array $rules = null): void
{
    foreach ($actions as $action) {
        $value = $action instanceof CollectionPermissionActionEnum ? $action->value : $action;
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $value,
            ],
            [
                'allowed' => true,
                'rules' => $rules,
            ],
        );
    }

    app(CollectionPermissionGuard::class)->forget($role->id);
}

/**
 * @param  list<FilePermissionActionEnum|string>  $actions
 */
function authzGrantFiles(Role $role, array $actions): void
{
    foreach ($actions as $action) {
        $value = $action instanceof FilePermissionActionEnum ? $action->value : $action;
        FilePermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'action' => $value,
            ],
            ['allowed' => true],
        );
    }

    app(FilePermissionGuard::class)->forget($role->id);
}

function authzMakeCollection(string $prefix = 'authz'): Collection
{
    $slug = $prefix.'-'.uniqid();

    return Collection::query()->create([
        'name' => ucfirst($prefix),
        'slug' => $slug,
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
}

function authzMakeStoredFile(string $name = 'hero.jpg', ?string $access = null, ?int $parentId = null): File
{
    Storage::disk('assets')->put('2026/10/'.$name, 'fake-bytes');

    return File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => $name,
        'path' => '/'.$name,
        'disk' => 'assets',
        'storage_path' => '2026/10/'.$name,
        'mime_type' => 'image/jpeg',
        'size' => 10,
        'width' => 800,
        'height' => 600,
        'hash' => hash('sha256', $name),
        'access' => $access,
        'parent_id' => $parentId,
    ]);
}

/**
 * @return callable(string, array<string, mixed>): TestResponse
 */
function authzClient(?string $token): callable
{
    return function (string $method, string $uri, array $data = []) use ($token): TestResponse {
        $pending = $token === null ? test() : test()->withToken($token);

        return match (strtoupper($method)) {
            'GET' => $pending->getJson($uri),
            'POST' => $pending->postJson($uri, $data),
            'PATCH' => $pending->patchJson($uri, $data),
            'DELETE' => $pending->deleteJson($uri),
            default => throw new InvalidArgumentException("Unsupported method {$method}"),
        };
    };
}

dataset('authz collection crud matrix', function () {
    $actions = [
        'list' => CollectionPermissionActionEnum::Read,
        'show' => CollectionPermissionActionEnum::Read,
        'create' => CollectionPermissionActionEnum::Create,
        'update' => CollectionPermissionActionEnum::Update,
        'delete' => CollectionPermissionActionEnum::Delete,
    ];

    $cases = [];

    foreach (['anonymous', 'api_key'] as $actor) {
        foreach ($actions as $operation => $grant) {
            $cases["{$actor} {$operation} allow with {$grant->value}"] = [
                $actor,
                $operation,
                [$grant],
                'allow',
            ];
            $cases["{$actor} {$operation} deny without grant"] = [
                $actor,
                $operation,
                [],
                'deny',
            ];
        }
    }

    foreach (array_keys($actions) as $operation) {
        $cases["revoked_key {$operation} unauthorized"] = [
            'revoked_key',
            $operation,
            [CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Create, CollectionPermissionActionEnum::Update, CollectionPermissionActionEnum::Delete],
            'unauthorized',
        ];
        $cases["expired_key {$operation} unauthorized"] = [
            'expired_key',
            $operation,
            [CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Create, CollectionPermissionActionEnum::Update, CollectionPermissionActionEnum::Delete],
            'unauthorized',
        ];
        $cases["admin_role_without_collection {$operation} deny"] = [
            'admin_role_without_collection',
            $operation,
            [],
            'deny',
        ];
    }

    return $cases;
});

it('enforces collection CRUD AuthZ matrix', function (
    string $actor,
    string $operation,
    array $grants,
    string $expectation,
): void {
    $collection = authzMakeCollection('crud');
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $slug = $collection->slug;

    $token = null;
    $role = publicRole();

    if ($actor === 'anonymous') {
        if ($grants !== []) {
            authzGrant($role, $collection, $grants);
        }
    } elseif ($actor === 'api_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        $role = $bundle['role'];
        if ($grants !== []) {
            authzGrant($role, $collection, $grants);
        }
    } elseif ($actor === 'revoked_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        authzGrant($bundle['role'], $collection, $grants);
        $bundle['key']->forceFill(['revoked_at' => now()])->save();
    } elseif ($actor === 'expired_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        authzGrant($bundle['role'], $collection, $grants);
        $bundle['key']->forceFill(['expires_at' => now()->subMinute()])->save();
    } elseif ($actor === 'admin_role_without_collection') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        $bundle['role']->syncPermissions([
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanEditCollections->value,
            PermissionEnum::CanCreateCollections->value,
            PermissionEnum::CanDeleteCollections->value,
        ]);
        // Intentionally no collection_permissions rows.
    }

    $client = authzClient($token);
    $response = match ($operation) {
        'list' => $client('GET', "/api/v1/collections/{$slug}/items"),
        'show' => $client('GET', "/api/v1/collections/{$slug}/items/{$item->id}"),
        'create' => $client('POST', "/api/v1/collections/{$slug}/items", ['data' => []]),
        'update' => $client('PATCH', "/api/v1/collections/{$slug}/items/{$item->id}", ['data' => []]),
        'delete' => $client('DELETE', "/api/v1/collections/{$slug}/items/{$item->id}"),
        default => throw new InvalidArgumentException("Unknown operation {$operation}"),
    };

    match ($expectation) {
        'allow' => expect($response->status())->toBeIn($operation === 'create' ? [201] : ($operation === 'delete' ? [204] : [200])),
        'deny' => $response->assertForbidden(),
        'unauthorized' => $response->assertUnauthorized(),
        default => throw new InvalidArgumentException("Unknown expectation {$expectation}"),
    };
})->with('authz collection crud matrix');

dataset('authz published draft visibility', function () {
    return [
        'anonymous list published allow draft hide' => ['anonymous', 'list', 'published', 'allow'],
        'anonymous list draft hide' => ['anonymous', 'list', 'draft', 'hide'],
        'anonymous show published allow' => ['anonymous', 'show', 'published', 'allow'],
        'anonymous show draft not found' => ['anonymous', 'show', 'draft', 'not_found'],
        'anonymous update published allow' => ['anonymous', 'update', 'published', 'allow'],
        'anonymous update draft forbidden' => ['anonymous', 'update', 'draft', 'forbidden'],
        'api_key list published allow' => ['api_key', 'list', 'published', 'allow'],
        'api_key list draft hide' => ['api_key', 'list', 'draft', 'hide'],
        'api_key show published allow' => ['api_key', 'show', 'published', 'allow'],
        'api_key show draft not found' => ['api_key', 'show', 'draft', 'not_found'],
        'api_key update published allow' => ['api_key', 'update', 'published', 'allow'],
        'api_key update draft forbidden' => ['api_key', 'update', 'draft', 'forbidden'],
    ];
});

it('enforces published vs draft item_filter AuthZ matrix', function (
    string $actor,
    string $operation,
    string $itemKind,
    string $expectation,
): void {
    $collection = authzMakeCollection('status');
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);

    $rules = [
        'fields' => [],
        'item_filter' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
            ],
        ],
    ];

    $token = null;
    $role = publicRole();
    if ($actor === 'api_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        $role = $bundle['role'];
    }

    $grants = [CollectionPermissionActionEnum::Read];
    if ($operation === 'update') {
        $grants[] = CollectionPermissionActionEnum::Update;
    }
    authzGrant($role, $collection, $grants, $rules);

    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'title' => 'Live',
        'status' => 'published',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'title' => 'WIP',
        'status' => 'draft',
    ], true));

    $target = $itemKind === 'published' ? $published : $draft;
    $client = authzClient($token);
    $slug = $collection->slug;

    if ($operation === 'list') {
        $response = $client('GET', "/api/v1/collections/{$slug}/items");
        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        if ($expectation === 'allow') {
            expect($ids)->toContain($target->id);
        } else {
            expect($ids)->not->toContain($target->id);
        }

        return;
    }

    if ($operation === 'show') {
        $response = $client('GET', "/api/v1/collections/{$slug}/items/{$target->id}");
        if ($expectation === 'allow') {
            $response->assertOk()->assertJsonPath('data.id', $target->id);
        } else {
            $response->assertNotFound();
        }

        return;
    }

    $response = $client('PATCH', "/api/v1/collections/{$slug}/items/{$target->id}", [
        'data' => ['title' => 'Edited'],
    ]);

    if ($expectation === 'allow') {
        $response->assertOk()->assertJsonPath('data.id', $target->id);
    } else {
        $response->assertForbidden();
    }
})->with('authz published draft visibility');

dataset('authz file access matrix', function () {
    return [
        'public file list with read allow' => ['public', 'list', [FilePermissionActionEnum::Read], 'allow'],
        'public file show with read allow' => ['public', 'show', [FilePermissionActionEnum::Read], 'allow'],
        'public file list without read deny' => ['public', 'list', [], 'deny'],
        'public file show without read deny' => ['public', 'show', [], 'deny'],
        'private file list without read_private hide' => ['private', 'list', [FilePermissionActionEnum::Read], 'hide'],
        'private file show without read_private deny' => ['private', 'show', [FilePermissionActionEnum::Read], 'deny'],
        'private file list with read_private allow' => ['private', 'list', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], 'allow'],
        'private file show with read_private allow' => ['private', 'show', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], 'allow'],
        'inherited private list without read_private hide' => ['inherited_private', 'list', [FilePermissionActionEnum::Read], 'hide'],
        'inherited private show without read_private deny' => ['inherited_private', 'show', [FilePermissionActionEnum::Read], 'deny'],
        'inherited private list with read_private allow' => ['inherited_private', 'list', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], 'allow'],
        'inherited private show with read_private allow' => ['inherited_private', 'show', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], 'allow'],
    ];
});

it('enforces file public private inherited AuthZ matrix', function (
    string $fileKind,
    string $operation,
    array $grants,
    string $expectation,
): void {
    $folder = null;
    if ($fileKind === 'inherited_private') {
        $folder = File::query()->create([
            'type' => FileTypeEnum::Folder,
            'name' => 'vault-'.uniqid(),
            'path' => '/vault-'.uniqid(),
            'disk' => 'assets',
            'access' => FileAccessEnum::Private->value,
        ]);
    }

    $name = $fileKind.'-'.uniqid().'.jpg';
    $file = match ($fileKind) {
        'public' => authzMakeStoredFile($name, FileAccessEnum::Public->value),
        'private' => authzMakeStoredFile($name, FileAccessEnum::Private->value),
        'inherited_private' => authzMakeStoredFile($name, null, $folder?->id),
        default => throw new InvalidArgumentException("Unknown file kind {$fileKind}"),
    };

    if ($grants !== []) {
        authzGrantFiles(publicRole(), $grants);
    }

    if ($operation === 'list') {
        $response = $this->getJson('/api/v1/files'.($folder ? '?parent_id='.$folder->id : ''));
        if ($expectation === 'deny') {
            $response->assertForbidden();

            return;
        }

        $response->assertOk();
        $names = collect($response->json('data'))->pluck('filename')->all();
        if ($expectation === 'allow') {
            expect($names)->toContain($file->name);
        } else {
            expect($names)->not->toContain($file->name);
        }

        return;
    }

    $response = $this->getJson("/api/v1/files/{$file->id}");
    if ($expectation === 'allow') {
        $response->assertOk()->assertJsonPath('data.id', $file->id);
    } else {
        $response->assertForbidden();
    }
})->with('authz file access matrix');

dataset('authz include files expand', function () {
    return [
        'public cover without file read denied signal' => ['public', [], 'denied'],
        'public cover with file read expanded' => ['public', [FilePermissionActionEnum::Read], 'expanded'],
        'private cover without read_private nulled' => ['private', [FilePermissionActionEnum::Read], 'nulled'],
        'private cover with read_private expanded' => ['private', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], 'expanded'],
        'inherited private without read_private nulled' => ['inherited_private', [FilePermissionActionEnum::Read], 'nulled'],
        'inherited private with read_private expanded' => ['inherited_private', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], 'expanded'],
    ];
});

it('enforces include=files expand AuthZ matrix', function (
    string $fileKind,
    array $fileGrants,
    string $expectation,
): void {
    $collection = authzMakeCollection('cover');
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $folder = null;
    if ($fileKind === 'inherited_private') {
        $folder = File::query()->create([
            'type' => FileTypeEnum::Folder,
            'name' => 'covers-'.uniqid(),
            'path' => '/covers-'.uniqid(),
            'disk' => 'assets',
            'access' => FileAccessEnum::Private->value,
        ]);
    }

    $file = match ($fileKind) {
        'public' => authzMakeStoredFile('cover-public-'.uniqid().'.jpg', FileAccessEnum::Public->value),
        'private' => authzMakeStoredFile('cover-private-'.uniqid().'.jpg', FileAccessEnum::Private->value),
        'inherited_private' => authzMakeStoredFile('cover-inherited-'.uniqid().'.jpg', null, $folder?->id),
        default => throw new InvalidArgumentException("Unknown file kind {$fileKind}"),
    };

    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection->fresh(['fields']),
        ['cover' => $file->id],
    );

    authzGrant(publicRole(), $collection, [CollectionPermissionActionEnum::Read]);
    if ($fileGrants !== []) {
        authzGrantFiles(publicRole(), $fileGrants);
    }

    $response = $this->getJson("/api/v1/collections/{$collection->slug}/items/{$item->id}?include=files")
        ->assertOk();

    match ($expectation) {
        'denied' => expect($response->json('data.data.cover.id'))->toBe($file->id)
            ->and($response->json('data.data.cover.access'))->toBe('denied')
            ->and($response->json('data.data.cover.url'))->toBeNull(),
        'nulled' => expect($response->json('data.data.cover'))->toBeNull(),
        'expanded' => expect($response->json('data.data.cover.id'))->toBe($file->id)
            ->and($response->json('data.data.cover.url'))->toBe(url("/api/v1/files/{$file->id}/content")),
        default => throw new InvalidArgumentException("Unknown expectation {$expectation}"),
    };
})->with('authz include files expand');

dataset('authz graphql read matrix', function () {
    return [
        'anonymous with read allow' => ['anonymous', true, 'allow'],
        'anonymous without read deny' => ['anonymous', false, 'deny'],
        'api_key with read allow' => ['api_key', true, 'allow'],
        'api_key without read deny' => ['api_key', false, 'deny'],
        'revoked_key unauthorized' => ['revoked_key', true, 'unauthorized'],
        'expired_key unauthorized' => ['expired_key', true, 'unauthorized'],
    ];
});

it('enforces GraphQL items AuthZ matrix', function (
    string $actor,
    bool $grantRead,
    string $expectation,
): void {
    $collection = authzMakeCollection('gql');
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['title' => 'Hi'], true),
    );

    $token = null;
    $role = publicRole();

    if ($actor === 'api_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        $role = $bundle['role'];
    } elseif ($actor === 'revoked_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        $role = $bundle['role'];
        $bundle['key']->forceFill(['revoked_at' => now()])->save();
    } elseif ($actor === 'expired_key') {
        $bundle = makeApiKeyForRole();
        $token = $bundle['plain'];
        $role = $bundle['role'];
        $bundle['key']->forceFill(['expires_at' => now()->subMinute()])->save();
    }

    if ($grantRead && ! in_array($actor, ['revoked_key', 'expired_key'], true)) {
        authzGrant($role, $collection, [CollectionPermissionActionEnum::Read]);
    } elseif ($grantRead) {
        authzGrant($role, $collection, [CollectionPermissionActionEnum::Read]);
    }

    $pending = $token === null ? $this : $this->withToken($token);
    $response = $pending->postJson('/api/graphql', [
        'query' => 'query($c: String!) { items(collection: $c) { data { id } meta { total } } }',
        'variables' => ['c' => $collection->slug],
    ]);

    if ($expectation === 'unauthorized') {
        $response->assertUnauthorized();

        return;
    }

    if ($expectation === 'allow') {
        $response->assertOk();
        expect($response->json('errors'))->toBeNull()
            ->and($response->json('data.items.meta.total'))->toBe(1);

        return;
    }

    expect(in_array($response->status(), [200, 403], true))->toBeTrue();
    if ($response->status() === 200) {
        expect($response->json('errors'))->not->toBeEmpty();
    }
})->with('authz graphql read matrix');

dataset('authz effective permission resolver', function () {
    return [
        'direct role has permission' => ['direct', PermissionEnum::CanShowUsers->value, true],
        'group role has permission' => ['group', PermissionEnum::CanShowCollections->value, true],
        'missing permission denied' => ['direct', PermissionEnum::CanDeleteUsers->value, false],
        'super admin always allows' => ['super_admin', PermissionEnum::CanForceDeleteCollections->value, true],
    ];
});

it('resolves EffectivePermissionResolver matrix without widening access', function (
    string $setup,
    string $permission,
    bool $expected,
): void {
    $user = User::factory()->create();
    $resolver = app(EffectivePermissionResolver::class);

    if ($setup === 'super_admin') {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    } elseif ($setup === 'direct') {
        $role = Role::query()->create([
            'name' => 'authz-direct-'.uniqid(),
            'guard_name' => config('auth.defaults.guard', 'web'),
            'is_system' => false,
            'is_assignable' => true,
        ]);
        $role->syncPermissions([PermissionEnum::CanShowUsers->value]);
        $user->assignRole($role);
    } elseif ($setup === 'group') {
        $role = Role::query()->create([
            'name' => 'authz-group-'.uniqid(),
            'guard_name' => config('auth.defaults.guard', 'web'),
            'is_system' => false,
            'is_assignable' => true,
        ]);
        $role->syncPermissions([PermissionEnum::CanShowCollections->value]);
        $group = UserGroup::query()->create([
            'name' => 'AuthZ Group '.uniqid(),
            'slug' => 'authz-group-'.uniqid(),
        ]);
        $group->roles()->attach($role);
        $user->groups()->attach($group);
    }

    expect($resolver->hasPermission($user, $permission))->toBe($expected);
})->with('authz effective permission resolver');

dataset('authz file permission guard canReadFile', function () {
    return [
        'public needs read only' => ['public', [FilePermissionActionEnum::Read], true],
        'public without read denied' => ['public', [], false],
        'private needs read_private' => ['private', [FilePermissionActionEnum::Read], false],
        'private with read_private allow' => ['private', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], true],
        'inherited private needs read_private' => ['inherited_private', [FilePermissionActionEnum::Read], false],
        'inherited private with read_private allow' => ['inherited_private', [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], true],
    ];
});

it('FilePermissionGuard canReadFile matrix names each combination', function (
    string $fileKind,
    array $grants,
    bool $expected,
): void {
    $folder = null;
    if ($fileKind === 'inherited_private') {
        $folder = File::query()->create([
            'type' => FileTypeEnum::Folder,
            'name' => 'guard-vault-'.uniqid(),
            'path' => '/guard-vault-'.uniqid(),
            'disk' => 'assets',
            'access' => FileAccessEnum::Private->value,
        ]);
    }

    $file = match ($fileKind) {
        'public' => authzMakeStoredFile('g-public-'.uniqid().'.jpg', FileAccessEnum::Public->value),
        'private' => authzMakeStoredFile('g-private-'.uniqid().'.jpg', FileAccessEnum::Private->value),
        'inherited_private' => authzMakeStoredFile('g-inherited-'.uniqid().'.jpg', null, $folder?->id),
        default => throw new InvalidArgumentException("Unknown file kind {$fileKind}"),
    };

    $role = Role::query()->create([
        'name' => 'file-guard-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_system' => false,
        'is_assignable' => true,
    ]);
    if ($grants !== []) {
        authzGrantFiles($role, $grants);
    }

    expect(app(FilePermissionGuard::class)->canReadFile($role->id, $file->fresh()))->toBe($expected);
})->with('authz file permission guard canReadFile');
