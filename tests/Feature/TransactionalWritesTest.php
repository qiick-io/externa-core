<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Events\ItemChatMessageCreatedEvent;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
});

/**
 * @return array{user: User, role: Role, collection: Collection, published: CollectionItem, draft: CollectionItem}
 */
function txBulkKitchen(): array
{
    $role = Role::query()->create([
        'name' => 'tx-bulk-'.uniqid(),
        'guard_name' => 'web',
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $user = User::factory()->create();
    $user->syncRoles([$role]);

    $collection = Collection::query()->create([
        'name' => 'Tx Bulk',
        'slug' => 'tx-bulk-'.uniqid(),
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

    foreach ([
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ] as $action) {
        CollectionPermission::query()->create([
            'role_id' => $role->id,
            'collection_id' => $collection->id,
            'action' => $action->value,
            'allowed' => true,
            'rules' => [
                'fields' => [],
                'item_filter' => [
                    'logic' => 'and',
                    'rules' => [
                        ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
                    ],
                ],
            ],
        ]);
    }
    app(CollectionPermissionGuardService::class)->forget($role->id);

    $normalizer = app(CollectionItemDataNormalizerService::class);
    $writer = app(CollectionItemValuesWriterService::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'title' => 'Pub',
        'status' => 'published',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'title' => 'Draft',
        'status' => 'draft',
    ], true));

    return compact('user', 'role', 'collection', 'published', 'draft');
}

it('rejects bulk delete before mutating when any selected item fails item AuthZ', function (): void {
    ['user' => $user, 'collection' => $collection, 'published' => $published, 'draft' => $draft] = txBulkKitchen();

    $this->actingAs($user)
        ->from(route('collections.items.index', $collection))
        ->post(route('collections.items.bulk', $collection), [
            'action' => 'delete',
            'ids' => [$published->id, $draft->id],
        ])
        ->assertForbidden();

    expect(CollectionItem::query()->whereKey([$published->id, $draft->id])->count())->toBe(2);
});

it('rejects double-claim of the same orphan chat attachment', function (): void {
    $user = grantCollectionPermissions(User::factory()->create(), [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    $this->actingAs($user);

    $upload = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->createWithContent('note.txt', 'once')],
    )->assertCreated()->json('attachment');

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'first',
        'attachment_ids' => [$upload['id']],
    ])->assertCreated();

    expect(CollectionItemChatAttachment::query()->where('id', $upload['id'])->value('message_id'))->not->toBeNull()
        ->and(CollectionItemChatMessage::query()->count())->toBe(1);

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'second',
        'attachment_ids' => [$upload['id']],
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['attachment_ids']);

    expect(CollectionItemChatMessage::query()->count())->toBe(1);
});

it('keeps a saved chat message when MessageCreated broadcast throws', function (): void {
    $user = grantCollectionPermissions(User::factory()->create(), [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
    ]);
    $collection = Collection::factory()->create();
    $item = $collection->items()->create([]);

    Event::listen(ItemChatMessageCreatedEvent::class, function (): void {
        throw new RuntimeException('reverb down');
    });

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'still saved',
        ])
        ->assertCreated()
        ->assertJsonPath('message.body', 'still saved');

    expect(CollectionItemChatMessage::query()->where('body', 'still saved')->exists())->toBeTrue();
});
