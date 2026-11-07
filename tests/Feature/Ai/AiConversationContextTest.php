<?php

use App\Ai\Agents\AppAssistant;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\AiPrompt;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\File;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    config([
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollections', 'ManageCollectionItems', 'ManageFiles'],
    ]);
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
});

/**
 * @param  array{fields?: array<string, array{read: bool, create: bool, update: bool}>, item_filter?: ?array}  $rules
 */
function contextUserWithCollectionRules(Collection $collection, array $rules, array $extraPermissions = []): User
{
    $role = Role::query()->create([
        'name' => 'ai-context-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
        ...$extraPermissions,
    ]);

    foreach ([
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ] as $action) {
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $action->value,
            ],
            [
                'allowed' => true,
                'rules' => $rules,
            ],
        );
    }

    app(CollectionPermissionGuardService::class)->forget($role->id);

    $user = User::factory()->create();
    $user->syncRoles([$role]);

    return $user;
}

/**
 * @return array{0: Collection, 1: CollectionItem, 2: CollectionItem}
 */
function seedContextArticles(): array
{
    $collection = Collection::query()->create([
        'name' => 'Context Articles',
        'slug' => 'context-articles-'.uniqid(),
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

    $normalizer = app(CollectionItemDataNormalizerService::class);
    $writer = app(CollectionItemValuesWriterService::class);

    $published = $collection->items()->create([]);
    $writer->sync($published, $collection, $normalizer->normalize($collection, [
        'title' => 'Readable article',
        'status' => 'published',
    ], true));

    $draft = $collection->items()->create([]);
    $writer->sync($draft, $collection, $normalizer->normalize($collection, [
        'title' => 'Secret draft',
        'status' => 'draft',
    ], true));

    return [$collection->fresh('fields'), $published->fresh(), $draft->fresh()];
}

test('readable context item reaches the model prompt', function () {
    [$collection, $published] = seedContextArticles();

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $this->actingAs($user);

    AppAssistant::fake(['ok']);

    $this->post(route('ai.chat'), [
        'message' => 'Summarize the attached item',
        'context_item_ids' => [$published->id],
    ])->assertOk();

    AppAssistant::assertPrompted(function ($prompt) use ($published, $collection): bool {
        $text = (string) $prompt->prompt;

        return str_contains($text, '[AI_CONTEXT_ITEMS]')
            && str_contains($text, '"item_id": '.$published->id)
            && str_contains($text, '"collection_id": '.$collection->id)
            && str_contains($text, 'Readable article');
    });
});

test('denied item cannot be attached via search or chat send', function () {
    [$collection, $published, $draft] = seedContextArticles();

    $rules = [
        'fields' => [
            'title' => ['read' => true, 'create' => true, 'update' => true],
            'status' => ['read' => true, 'create' => true, 'update' => true],
        ],
        'item_filter' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'status', 'operator' => 'equals', 'value' => 'published'],
            ],
        ],
    ];

    $user = contextUserWithCollectionRules($collection, $rules);
    $this->actingAs($user);

    $search = $this->getJson(route('ai.context.items', [
        'collection_id' => $collection->id,
    ]));

    $search->assertOk();
    $ids = collect($search->json('items'))->pluck('id')->all();
    expect($ids)->toContain($published->id)->not->toContain($draft->id);

    AppAssistant::fake(['should-not-run']);

    $this->postJson(route('ai.chat'), [
        'message' => 'Leak the draft',
        'context_item_ids' => [$draft->id],
    ])->assertUnprocessable()
        ->assertJsonPath('message', 'One or more context items are not accessible.');

    AppAssistant::assertNeverPrompted();
});

test('access revoked between attach and send rejects the context item', function () {
    [$collection, $published] = seedContextArticles();

    $rules = [
        'fields' => [
            'title' => ['read' => true, 'create' => true, 'update' => true],
            'status' => ['read' => true, 'create' => true, 'update' => true],
        ],
        'item_filter' => null,
    ];

    $user = contextUserWithCollectionRules($collection, $rules);
    $this->actingAs($user);

    $this->getJson(route('ai.context.items', [
        'collection_id' => $collection->id,
    ]))->assertOk()
        ->assertJsonFragment(['id' => $published->id]);

    // Tighten item_filter after the picker returned the item (access revoked mid-flight).
    CollectionPermission::query()
        ->where('role_id', $user->roles->first()->id)
        ->where('collection_id', $collection->id)
        ->update([
            'rules' => [
                'fields' => $rules['fields'],
                'item_filter' => [
                    'logic' => 'and',
                    'rules' => [
                        ['field' => 'status', 'operator' => 'equals', 'value' => 'archived'],
                    ],
                ],
            ],
        ]);
    app(CollectionPermissionGuardService::class)->forget($user->roles->first()->id);

    AppAssistant::fake(['should-not-run']);

    $this->postJson(route('ai.chat'), [
        'message' => 'Use the previously attached item',
        'context_item_ids' => [$published->id],
    ])->assertUnprocessable()
        ->assertJsonPath('message', 'One or more context items are not accessible.');

    AppAssistant::assertNeverPrompted();
});

test('denied file cannot be attached or injected', function () {
    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'secret.pdf',
        'path' => 'files/secret.pdf',
        'disk' => 'local',
        'mime_type' => 'application/pdf',
        'size' => 123,
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        // Intentionally no CanShowFiles.
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $this->getJson(route('ai.context.files'))
        ->assertOk()
        ->assertJsonPath('files', []);

    AppAssistant::fake(['should-not-run']);

    $this->postJson(route('ai.chat'), [
        'message' => 'Describe the file',
        'context_file_ids' => [$file->id],
    ])->assertUnprocessable()
        ->assertJsonPath('message', 'One or more context files are not accessible.');

    AppAssistant::assertNeverPrompted();
});

test('readable file and saved prompt reach the model prompt', function () {
    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'brief.pdf',
        'path' => 'files/brief.pdf',
        'disk' => 'local',
        'mime_type' => 'application/pdf',
        'size' => 456,
    ]);

    $prompt = AiPrompt::factory()->create([
        'name' => 'Tone guide',
        'body' => 'Always reply in concise bullet points.',
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    AppAssistant::fake(['ok']);

    $this->post(route('ai.chat'), [
        'message' => 'Use this context',
        'context_file_ids' => [$file->id],
        'context_prompt_ids' => [$prompt->id],
    ])->assertOk();

    AppAssistant::assertPrompted(function ($agentPrompt) use ($file, $prompt): bool {
        $text = (string) $agentPrompt->prompt;

        return str_contains($text, '[AI_CONTEXT_FILES]')
            && str_contains($text, 'file_id='.$file->id)
            && str_contains($text, '[AI_SAVED_PROMPT id='.$prompt->id)
            && str_contains($text, 'Always reply in concise bullet points.');
    });
});
