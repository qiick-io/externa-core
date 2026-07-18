<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ImportCollectionCsv;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\AiChatAttachment;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('local');
});

test('users can upload csv attachments for ai chat', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $file = UploadedFile::fake()->createWithContent(
        'prodotti.csv',
        "title,price\nMela,1.50\n",
    );

    $response = $this->post(route('ai.attachments.store'), [
        'file' => $file,
    ]);

    $response->assertCreated()
        ->assertJsonPath('attachment.name', 'prodotti.csv');

    $attachmentId = $response->json('attachment.id');
    expect($attachmentId)->toBeString()
        ->and(AiChatAttachment::query()->where('id', $attachmentId)->where('user_id', $user->id)->exists())->toBeTrue();
});

test('ai attachment upload rejects unsupported mime types', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $file = UploadedFile::fake()->create('malware.bin', 100, 'application/octet-stream');

    $this->post(route('ai.attachments.store'), [
        'file' => $file,
    ], [
        'Accept' => 'application/json',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);

    expect(AiChatAttachment::query()->count())->toBe(0);
});

test('import collection csv tool creates items from attachment', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'sku',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $path = 'ai-chat-attachments/'.$user->id.'/import.csv';
    Storage::disk('local')->put($path, "title,sku\nAlpha,A1\nBeta,B2\n");

    $attachment = AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => 'import.csv',
        'mime_type' => 'text/csv',
        'disk' => 'local',
        'path' => $path,
        'size' => Storage::disk('local')->size($path),
        'expires_at' => now()->addHour(),
    ]);

    $result = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_id' => $collection->id,
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"created": 2')
        ->and(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(2)
        ->and(AiChatAttachment::query()->find($attachment->id))->toBeNull();

    expect(Activity::query()->where('event', 'ai_tool')->where('log_name', 'ai')->exists())->toBeTrue()
        ->and(Activity::query()->where('event', 'ai_mutation')->where('log_name', 'ai')->exists())->toBeTrue();
});

test('import collection csv tool denies without create permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $path = 'ai-chat-attachments/'.$user->id.'/denied.csv';
    Storage::disk('local')->put($path, "title\nNope\n");

    $attachment = AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => 'denied.csv',
        'mime_type' => 'text/csv',
        'disk' => 'local',
        'path' => $path,
        'size' => 10,
        'expires_at' => now()->addHour(),
    ]);

    $result = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_id' => $collection->id,
    ]));

    expect($result)->toContain('Permesso mancante')
        ->and(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(0)
        ->and(AiChatAttachment::query()->find($attachment->id))->not->toBeNull();
});

test('import collection csv tool creates collection fields and items from headers', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $csv = implode("\n", [
        'sku,title,category,price,stock,brand,color,size,warehouse,notes',
        'A1,Alpha,fruit,1.50,10,Acme,red,S,W1,first',
        'B2,Beta,fruit,2.00,5,Acme,blue,M,W1,second',
        'C3,Gamma,veg,0.80,20,BetaCo,green,L,W2,third',
    ])."\n";

    $path = 'ai-chat-attachments/'.$user->id.'/bootstrap.csv';
    Storage::disk('local')->put($path, $csv);

    $attachment = AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => 'bootstrap.csv',
        'mime_type' => 'text/csv',
        'disk' => 'local',
        'path' => $path,
        'size' => Storage::disk('local')->size($path),
        'expires_at' => now()->addHour(),
    ]);

    $result = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_name' => 'import-e2e-test',
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"collection_created": true')
        ->and($result)->toContain('"created": 3');

    $collection = Collection::query()->where('name', 'import-e2e-test')->first();

    expect($collection)->not->toBeNull()
        ->and($collection->fields()->count())->toBe(10)
        ->and(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(3);

    $firstItem = CollectionItem::query()
        ->where('collection_id', $collection->id)
        ->with('fieldValues.field')
        ->first();

    $valuesByField = $firstItem->fieldValues->mapWithKeys(
        fn ($value) => [$value->field->name => $value->value]
    );

    expect($valuesByField['sku'] ?? null)->toBe('A1')
        ->and($valuesByField['title'] ?? null)->toBe('Alpha')
        ->and($valuesByField['notes'] ?? null)->toBe('first');
});

test('import collection csv tool is only registered with create permission', function () {
    $withCreate = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);

    expect(collect((new AppAssistant($withCreate))->tools())->map(fn ($tool) => $tool::class)->all())
        ->toContain(ImportCollectionCsv::class);

    $withoutCreate = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    expect(collect((new AppAssistant($withoutCreate))->tools())->map(fn ($tool) => $tool::class)->all())
        ->not->toContain(ImportCollectionCsv::class);
});
