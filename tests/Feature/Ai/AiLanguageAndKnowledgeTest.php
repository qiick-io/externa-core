<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\DescribeFieldTypes;
use App\Ai\Tools\ManageCollections;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('app assistant instructions are language-neutral and never assume Italian', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);

    $instructions = (string) (new AppAssistant($user))->instructions();

    expect($instructions)
        ->toContain('Reply in the same language as the user’s latest message')
        ->toContain('Never assume Italian')
        ->toContain('DescribeFieldTypes')
        ->not->toContain('politely in Italian')
        ->not->toContain('Prefer concise answers in Italian');
});

test('describe field types returns blocks cookbook for complex types', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new DescribeFieldTypes)->handle(new Request([
        'types' => 'blocks',
    ]));

    expect($result)->not->toStartWith('Error:');

    $payload = json_decode($result, true);

    expect($payload)->toBeArray()
        ->and($payload['ok'])->toBeTrue()
        ->and($payload['types'])->toBeArray()->not->toBeEmpty()
        ->and($payload['types'][0]['type'])->toBe('blocks')
        ->and($payload['types'][0]['settings_json_example'])->toHaveKey('block_types')
        ->and($payload['types'][0]['nested_rules'])->toHaveKey('allowed_nested_types')
        ->and($payload['meta']['max_blocks_depth'])->toBe(5);
});

test('describe field types is registered when user can manage collections', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => $tool::class)
        ->all();

    expect($tools)->toContain(DescribeFieldTypes::class);
});

test('create_field accepts valid blocks settings_json via HTTP-equivalent pipeline', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'articles-ai-blocks',
        'is_singleton' => false,
    ]);

    $settings = [
        'max_blocks_depth' => 3,
        'block_types' => [
            [
                'key' => 'rich_text',
                'label' => 'Rich text',
                'fields' => [
                    ['name' => 'title', 'type' => 'string', 'translatable' => true, 'settings' => []],
                    ['name' => 'body', 'type' => 'wysiwyg', 'translatable' => true, 'settings' => []],
                ],
            ],
        ],
    ];

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create_field',
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings_json' => json_encode($settings),
    ]));

    expect($result)->not->toStartWith('Error:');

    $payload = json_decode($result, true);

    expect($payload['ok'])->toBeTrue()
        ->and($payload['field']['type'])->toBe('blocks')
        ->and($payload['field']['settings']['block_types'][0]['key'])->toBe('rich_text')
        ->and($payload['field']['settings']['max_blocks_depth'])->toBe(3);
});

test('create_field rejects invalid blocks settings_json with english error', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages-ai-blocks-invalid',
        'is_singleton' => false,
    ]);

    // ponytail: BlocksFieldSchema slugifies/clamps many bad shapes; use a shared settings
    // key that survives normalize but fails HTTP Rule::in (same pipeline as StoreFieldRequest).
    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create_field',
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Blocks->value,
        'settings_json' => json_encode([
            'block_types' => [
                [
                    'key' => 'section',
                    'label' => 'Section',
                    'fields' => [
                        ['name' => 'title', 'type' => 'string', 'settings' => []],
                    ],
                ],
            ],
            'trigger' => 'not-a-valid-trigger',
        ]),
    ]));

    expect($result)
        ->toStartWith('Error: Invalid settings_json')
        ->not->toContain('Permesso mancante')
        ->not->toContain('impostazioni');
});

test('manage collections list includes field name and type', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::query()->create([
        'name' => 'Listed',
        'slug' => 'listed-ai',
        'is_singleton' => false,
    ]);
    $collection->fields()->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
        'settings' => null,
    ]);

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'list',
    ]));

    $payload = json_decode($result, true);

    expect($payload['collections'])->toBeArray();

    $row = collect($payload['collections'])->firstWhere('id', $collection->id);

    expect($row)->not->toBeNull()
        ->and($row['fields'][0]['name'])->toBe('title')
        ->and($row['fields'][0]['type'])->toBe('string');
});
