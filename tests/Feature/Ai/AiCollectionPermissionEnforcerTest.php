<?php

use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\QueryCollectionItems;
use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Laravel\Ai\Tools\Request;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * Spatie-ok AI user whose role also carries collection_permissions field ACL / item_filter.
 *
 * @param  array{fields?: array<string, array{read: bool, create: bool, update: bool}>, item_filter?: ?array}  $rules
 */
function aiUserWithCollectionRules(Collection $collection, array $rules, array $actions = []): User
{
    $role = Role::query()->create([
        'name' => 'ai-enforcer-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $actionList = $actions !== [] ? $actions : [
        CollectionPermissionAction::Read,
        CollectionPermissionAction::Create,
        CollectionPermissionAction::Update,
        CollectionPermissionAction::Delete,
    ];

    foreach ($actionList as $action) {
        $value = $action instanceof CollectionPermissionAction ? $action->value : $action;
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

    $user = User::factory()->create();
    $user->syncRoles([$role]);

    return $user;
}

function seedArticlesForAiEnforcer(): array
{
    $collection = Collection::query()->create([
        'name' => 'AI Articles',
        'slug' => 'ai-articles-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
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

    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'title' => 'Public post',
        'status' => 'published',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'title' => 'Secret draft',
        'status' => 'draft',
    ], true));

    return [$collection->fresh('fields'), $published->fresh(), $draft->fresh()];
}

test('AI item tools honor item_filter and field deny like HTTP', function () {
    [$collection, $published, $draft] = seedArticlesForAiEnforcer();

    $rules = [
        'fields' => [
            'title' => ['read' => true, 'create' => true, 'update' => true],
            'status' => ['read' => false, 'create' => false, 'update' => false],
        ],
        'item_filter' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
            ],
        ],
    ];

    $user = aiUserWithCollectionRules($collection, $rules);
    $this->actingAs($user);

    $listed = json_decode((string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'list',
        'collection_id' => $collection->id,
        'limit' => 50,
    ])), true);

    expect($listed)->toBeArray()
        ->and(collect($listed['items'] ?? [])->pluck('id')->all())
        ->toContain($published->id)
        ->not->toContain($draft->id);

    $publishedPayload = json_decode((string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'get',
        'item_id' => $published->id,
    ])), true);

    expect($publishedPayload['data'] ?? [])->toHaveKey('title')
        ->and($publishedPayload['data'] ?? [])->not->toHaveKey('status');

    $draftGet = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'get',
        'item_id' => $draft->id,
    ]));
    expect($draftGet)->toContain('Item not found');

    $updateDenied = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'update',
        'item_id' => $published->id,
        'data_json' => json_encode(['status' => 'archived']),
    ]));
    expect($updateDenied)->toContain('You cannot write fields');

    $updateOutsideFilter = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'update',
        'item_id' => $draft->id,
        'data_json' => json_encode(['title' => 'Nope']),
    ]));
    expect($updateOutsideFilter)->toContain('outside your permission filter');

    $queried = json_decode((string) (new QueryCollectionItems)->handle(new Request([
        'collection_id' => $collection->id,
        'filter_json' => '',
        'limit' => 50,
    ])), true);

    $queryIds = collect($queried['rows'] ?? [])->pluck('id')->all();
    expect($queryIds)->toContain($published->id)->not->toContain($draft->id);

    $publishedRow = collect($queried['rows'] ?? [])->firstWhere('id', $published->id);
    expect($publishedRow)->toHaveKey('title')->not->toHaveKey('status');
});
