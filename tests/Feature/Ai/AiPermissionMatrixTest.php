<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ExportCollection;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageUsers;
use App\Ai\Tools\QueryCollectionItems;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

/**
 * Create a user authorized for AI with one additional domain permission.
 *
 * @return array{0: User, 1: string} The user and the granted permission name.
 */
function userWithOnlyAiPermission(string $permission): array
{
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        $permission,
    ]);

    return [$user, $permission];
}

test('can-use-ai alone can open assistant but gets no domain tools', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->get(route('ai.index'))->assertOk();

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->values()
        ->all();

    expect($tools)->toBeEmpty();

    $create = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create',
        'name' => 'Blocked',
    ]));

    expect($create)->toContain('Permesso mancante');
});

test('ai page is forbidden without can-use-ai', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('ai.index'))->assertForbidden();
});

dataset('collection permission matrix', function () {
    $collection = fn () => Collection::factory()->create(['name' => 'Matrix', 'slug' => 'matrix-'.uniqid()]);

    return [
        'show list allow' => [
            PermissionEnum::CanShowCollections->value,
            fn () => (string) (new ManageCollections)->handle(new Request(['action' => 'list'])),
            true,
            null,
        ],
        'show list deny with create only' => [
            PermissionEnum::CanCreateCollections->value,
            fn () => (string) (new ManageCollections)->handle(new Request(['action' => 'list'])),
            false,
            null,
        ],
        'create allow' => [
            PermissionEnum::CanCreateCollections->value,
            fn () => (string) (new ManageCollections)->handle(new Request([
                'action' => 'create',
                'name' => 'Created By Matrix',
                'slug' => 'created-by-matrix-'.uniqid(),
            ])),
            true,
            null,
        ],
        'create deny with show only' => [
            PermissionEnum::CanShowCollections->value,
            fn () => (string) (new ManageCollections)->handle(new Request([
                'action' => 'create',
                'name' => 'Nope',
            ])),
            false,
            null,
        ],
        'edit allow' => [
            PermissionEnum::CanEditCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'update',
                    'collection_id' => $model->id,
                    'name' => 'Renamed',
                ]));
            },
            true,
            null,
        ],
        'edit deny with show only' => [
            PermissionEnum::CanShowCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'update',
                    'collection_id' => $model->id,
                    'name' => 'Renamed',
                ]));
            },
            false,
            null,
        ],
        'delete allow' => [
            PermissionEnum::CanDeleteCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'delete',
                    'collection_id' => $model->id,
                ]));
            },
            true,
            null,
        ],
        'delete deny with edit only' => [
            PermissionEnum::CanEditCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'delete',
                    'collection_id' => $model->id,
                ]));
            },
            false,
            null,
        ],
        'restore allow' => [
            PermissionEnum::CanRestoreCollections->value,
            function () use ($collection) {
                $model = $collection();
                $model->delete();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'restore',
                    'collection_id' => $model->id,
                ]));
            },
            true,
            null,
        ],
        'restore deny with delete only' => [
            PermissionEnum::CanDeleteCollections->value,
            function () use ($collection) {
                $model = $collection();
                $model->delete();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'restore',
                    'collection_id' => $model->id,
                ]));
            },
            false,
            null,
        ],
        'force delete allow' => [
            PermissionEnum::CanForceDeleteCollections->value,
            function () use ($collection) {
                $model = $collection();
                $model->delete();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'force_delete',
                    'collection_id' => $model->id,
                ]));
            },
            true,
            null,
        ],
        'force delete deny with restore only' => [
            PermissionEnum::CanRestoreCollections->value,
            function () use ($collection) {
                $model = $collection();
                $model->delete();

                return (string) (new ManageCollections)->handle(new Request([
                    'action' => 'force_delete',
                    'collection_id' => $model->id,
                ]));
            },
            false,
            null,
        ],
        'export allow' => [
            PermissionEnum::CanShowCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ExportCollection)->handle(new Request([
                    'collection_id' => $model->id,
                    'format' => 'json',
                ]));
            },
            true,
            null,
        ],
        'export deny with create only' => [
            PermissionEnum::CanCreateCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ExportCollection)->handle(new Request([
                    'collection_id' => $model->id,
                    'format' => 'json',
                ]));
            },
            false,
            null,
        ],
        'query allow' => [
            PermissionEnum::CanShowCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new QueryCollectionItems)->handle(new Request([
                    'collection_id' => $model->id,
                ]));
            },
            true,
            null,
        ],
        'import deny with show only' => [
            PermissionEnum::CanShowCollections->value,
            fn () => (string) (new ImportCollectionCsv)->handle(new Request([
                'attachment_id' => 'missing',
                'collection_name' => 'Nope',
            ])),
            false,
            null,
        ],
        'item create allow' => [
            PermissionEnum::CanCreateCollections->value,
            function () use ($collection) {
                $model = $collection();

                return (string) (new ManageCollectionItems)->handle(new Request([
                    'action' => 'create',
                    'collection_id' => $model->id,
                    'data_json' => '{}',
                ]));
            },
            true,
            null,
        ],
        'item update deny with show only' => [
            PermissionEnum::CanShowCollections->value,
            function () use ($collection) {
                $model = $collection();
                $item = CollectionItem::factory()->create(['collection_id' => $model->id]);

                return (string) (new ManageCollectionItems)->handle(new Request([
                    'action' => 'update',
                    'item_id' => $item->id,
                    'data_json' => '{}',
                ]));
            },
            false,
            null,
        ],
        'item delete allow' => [
            PermissionEnum::CanDeleteCollections->value,
            function () use ($collection) {
                $model = $collection();
                $item = CollectionItem::factory()->create(['collection_id' => $model->id]);

                return (string) (new ManageCollectionItems)->handle(new Request([
                    'action' => 'delete',
                    'item_id' => $item->id,
                ]));
            },
            true,
            null,
        ],
    ];
});

test('collection tool actions respect each permission', function (string $permission, Closure $invoke, bool $shouldAllow) {
    [$user] = userWithOnlyAiPermission($permission);
    $this->actingAs($user);

    $result = $invoke();

    if ($shouldAllow) {
        expect($result)->not->toContain('Permesso mancante');
    } else {
        expect($result)->toContain('Permesso mancante');
    }
})->with('collection permission matrix');

dataset('file permission matrix', function () {
    $folder = fn () => File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'MatrixFolder-'.uniqid(),
        'path' => '/MatrixFolder-'.uniqid(),
        'disk' => 'assets',
    ]);

    return [
        'show allow' => [
            PermissionEnum::CanShowFiles->value,
            fn () => (string) (new ManageFiles)->handle(new Request(['action' => 'list'])),
            true,
        ],
        'show deny with create only' => [
            PermissionEnum::CanCreateFiles->value,
            fn () => (string) (new ManageFiles)->handle(new Request(['action' => 'list'])),
            false,
        ],
        'create folder allow' => [
            PermissionEnum::CanCreateFiles->value,
            fn () => (string) (new ManageFiles)->handle(new Request([
                'action' => 'create_folder',
                'name' => 'AI Folder '.uniqid(),
            ])),
            true,
        ],
        'create deny with show only' => [
            PermissionEnum::CanShowFiles->value,
            fn () => (string) (new ManageFiles)->handle(new Request([
                'action' => 'create_folder',
                'name' => 'Blocked',
            ])),
            false,
        ],
        'rename allow' => [
            PermissionEnum::CanEditFiles->value,
            function () use ($folder) {
                $model = $folder();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'rename',
                    'file_id' => $model->id,
                    'name' => 'Renamed-'.uniqid(),
                ]));
            },
            true,
        ],
        'rename deny with show only' => [
            PermissionEnum::CanShowFiles->value,
            function () use ($folder) {
                $model = $folder();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'rename',
                    'file_id' => $model->id,
                    'name' => 'Nope',
                ]));
            },
            false,
        ],
        'delete allow' => [
            PermissionEnum::CanDeleteFiles->value,
            function () use ($folder) {
                $model = $folder();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'delete',
                    'file_id' => $model->id,
                ]));
            },
            true,
        ],
        'delete deny with edit only' => [
            PermissionEnum::CanEditFiles->value,
            function () use ($folder) {
                $model = $folder();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'delete',
                    'file_id' => $model->id,
                ]));
            },
            false,
        ],
        'restore allow' => [
            PermissionEnum::CanRestoreFiles->value,
            function () use ($folder) {
                $model = $folder();
                $model->delete();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'restore',
                    'file_id' => $model->id,
                ]));
            },
            true,
        ],
        'restore deny with delete only' => [
            PermissionEnum::CanDeleteFiles->value,
            function () use ($folder) {
                $model = $folder();
                $model->delete();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'restore',
                    'file_id' => $model->id,
                ]));
            },
            false,
        ],
        'force delete allow' => [
            PermissionEnum::CanForceDeleteFiles->value,
            function () use ($folder) {
                $model = $folder();
                $model->delete();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'force_delete',
                    'file_id' => $model->id,
                ]));
            },
            true,
        ],
        'force delete deny with restore only' => [
            PermissionEnum::CanRestoreFiles->value,
            function () use ($folder) {
                $model = $folder();
                $model->delete();

                return (string) (new ManageFiles)->handle(new Request([
                    'action' => 'force_delete',
                    'file_id' => $model->id,
                ]));
            },
            false,
        ],
    ];
});

test('file tool actions respect each permission', function (string $permission, Closure $invoke, bool $shouldAllow) {
    [$user] = userWithOnlyAiPermission($permission);
    $this->actingAs($user);

    $result = $invoke();

    if ($shouldAllow) {
        expect($result)->not->toContain('Permesso mancante');
    } else {
        expect($result)->toContain('Permesso mancante');
    }
})->with('file permission matrix');

dataset('user permission matrix', function () {
    return [
        'list allow' => [
            PermissionEnum::CanShowUsers->value,
            fn () => (string) (new ManageUsers)->handle(new Request(['action' => 'list'])),
            true,
        ],
        'list deny with create only' => [
            PermissionEnum::CanCreateUsers->value,
            fn () => (string) (new ManageUsers)->handle(new Request(['action' => 'list'])),
            false,
        ],
        'create allow' => [
            PermissionEnum::CanCreateUsers->value,
            fn () => (string) (new ManageUsers)->handle(new Request([
                'action' => 'create',
                'first_name' => 'AI',
                'last_name' => 'User',
                'email' => 'ai-matrix-'.uniqid().'@example.com',
                'password' => 'Password1!x',
            ])),
            true,
        ],
        'create deny with show only' => [
            PermissionEnum::CanShowUsers->value,
            fn () => (string) (new ManageUsers)->handle(new Request([
                'action' => 'create',
                'first_name' => 'AI',
                'last_name' => 'User',
                'email' => 'blocked-'.uniqid().'@example.com',
                'password' => 'Password1!x',
            ])),
            false,
        ],
        'update allow' => [
            PermissionEnum::CanEditUsers->value,
            function () {
                $target = User::factory()->create();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'update',
                    'user_id' => $target->id,
                    'first_name' => 'Edited',
                ]));
            },
            true,
        ],
        'update deny with show only' => [
            PermissionEnum::CanShowUsers->value,
            function () {
                $target = User::factory()->create();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'update',
                    'user_id' => $target->id,
                    'first_name' => 'Edited',
                ]));
            },
            false,
        ],
        'delete allow' => [
            PermissionEnum::CanDeleteUsers->value,
            function () {
                $target = User::factory()->create();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'delete',
                    'user_id' => $target->id,
                ]));
            },
            true,
        ],
        'delete deny with edit only' => [
            PermissionEnum::CanEditUsers->value,
            function () {
                $target = User::factory()->create();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'delete',
                    'user_id' => $target->id,
                ]));
            },
            false,
        ],
        'restore allow' => [
            PermissionEnum::CanRestoreUsers->value,
            function () {
                $target = User::factory()->create();
                $target->delete();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'restore',
                    'user_id' => $target->id,
                ]));
            },
            true,
        ],
        'restore deny with delete only' => [
            PermissionEnum::CanDeleteUsers->value,
            function () {
                $target = User::factory()->create();
                $target->delete();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'restore',
                    'user_id' => $target->id,
                ]));
            },
            false,
        ],
        'force delete allow' => [
            PermissionEnum::CanForceDeleteUsers->value,
            function () {
                $target = User::factory()->create();
                $target->delete();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'force_delete',
                    'user_id' => $target->id,
                ]));
            },
            true,
        ],
        'force delete deny with restore only' => [
            PermissionEnum::CanRestoreUsers->value,
            function () {
                $target = User::factory()->create();
                $target->delete();

                return (string) (new ManageUsers)->handle(new Request([
                    'action' => 'force_delete',
                    'user_id' => $target->id,
                ]));
            },
            false,
        ],
    ];
});

test('user tool actions respect each permission', function (string $permission, Closure $invoke, bool $shouldAllow) {
    [$user] = userWithOnlyAiPermission($permission);
    $this->actingAs($user);

    $result = $invoke();

    if ($shouldAllow) {
        expect($result)->not->toContain('Permesso mancante');
    } else {
        expect($result)->toContain('Permesso mancante');
    }
})->with('user permission matrix');

test('app assistant registers tools only for granted permission families', function (string $permission, array $expectedToolBasenames) {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        $permission,
    ]);

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->values()
        ->all();

    foreach ($expectedToolBasenames as $basename) {
        expect($tools)->toContain($basename);
    }
})->with([
    'collections show' => [
        PermissionEnum::CanShowCollections->value,
        ['ManageCollections', 'ManageCollectionItems', 'QueryCollectionItems', 'ExportCollection', 'SearchSimilarCollectionItems'],
    ],
    'collections create' => [
        PermissionEnum::CanCreateCollections->value,
        ['ManageCollections', 'ManageCollectionItems', 'ImportCollectionCsv', 'ImportRemoteJson', 'ExtractPdfText', 'GetImportJobStatus', 'ManageAiSyncSources'],
    ],
    'collections delete' => [
        PermissionEnum::CanDeleteCollections->value,
        ['ManageCollections', 'ManageCollectionItems', 'RollbackLastAiTurn'],
    ],
    'files show' => [
        PermissionEnum::CanShowFiles->value,
        ['ManageFiles'],
    ],
    'users show' => [
        PermissionEnum::CanShowUsers->value,
        ['ManageUsers'],
    ],
    'roles show' => [
        PermissionEnum::CanShowRoles->value,
        ['ManageRoles'],
    ],
    'groups show' => [
        PermissionEnum::CanShowGroups->value,
        ['ManageGroups'],
    ],
    'activity logs show' => [
        PermissionEnum::CanShowActivityLogs->value,
        ['QueryActivityLogs'],
    ],
]);

test('reader role with can-use-ai can view ai page but cannot mutate collections via tools', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanShowUsers->value,
    ]);
    $this->actingAs($user);

    $this->get(route('ai.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('ai/index'));

    $create = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create',
        'name' => 'Should Fail',
    ]));
    $import = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => 'x',
        'collection_name' => 'Nope',
    ]));
    $deleteFile = (string) (new ManageFiles)->handle(new Request([
        'action' => 'delete',
        'file_id' => 1,
    ]));

    expect($create)->toContain('Permesso mancante')
        ->and($import)->toContain('Permesso mancante')
        ->and($deleteFile)->toContain('Permesso mancante');
});
