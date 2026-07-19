<?php

use App\Ai\Tools\ExportCollection;
use App\Ai\Tools\ExtractPdfText;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageUsers;
use App\Ai\Tools\QueryCollectionItems;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\AiChatAttachment;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Ai\Tools\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('local');
    Storage::fake('assets');
});

/**
 * Persist a fake AI chat attachment on the local disk for phase-two tool tests.
 */
function phaseTwoAttachment(User $user, string $name, string $content, string $mime): AiChatAttachment
{
    $path = "ai-chat-attachments/{$user->id}/{$name}";
    Storage::disk('local')->put($path, $content);

    return AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => $name,
        'mime_type' => $mime,
        'disk' => 'local',
        'path' => $path,
        'size' => strlen($content),
        'expires_at' => now()->addHour(),
    ]);
}

/**
 * Create a collection item and write normalized field values through the production pipeline.
 */
function phaseTwoWriteItem(Collection $collection, array $data): CollectionItem
{
    $item = $collection->items()->create([]);
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, true);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);

    return $item;
}

/**
 * Build a minimal valid PDF byte string containing the given visible text.
 */
function phaseTwoPdf(string $text): string
{
    $stream = "BT /F1 18 Tf 72 720 Td ({$text}) Tj ET";
    $objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Length '.strlen($stream)." >>\nstream\n{$stream}\nendstream",
    ];
    $pdf = "%PDF-1.4\n";
    $offsets = [0];

    foreach ($objects as $index => $object) {
        $offsets[] = strlen($pdf);
        $pdf .= ($index + 1)." 0 obj\n{$object}\nendobj\n";
    }

    $xrefOffset = strlen($pdf);
    $pdf .= "xref\n0 6\n0000000000 65535 f \n";

    foreach (array_slice($offsets, 1) as $offset) {
        $pdf .= sprintf("%010d 00000 n \n", $offset);
    }

    return $pdf."trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{$xrefOffset}\n%%EOF";
}

test('csv import infers number and boolean fields and dry run writes nothing', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $attachment = phaseTwoAttachment(
        $user,
        'typed.csv',
        "sku,price,active\nA1,12.5,true\nA2,8,false\n",
        'text/csv',
    );

    $preview = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_name' => 'typed-preview',
        'dry_run' => true,
    ]));

    expect($preview)->toContain('"dry_run": true')
        ->and($preview)->toContain('"type": "number"')
        ->and($preview)->toContain('"type": "boolean"')
        ->and(Collection::query()->where('name', 'typed-preview')->exists())->toBeFalse()
        ->and(AiChatAttachment::query()->find($attachment->id))->not->toBeNull();

    (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_name' => 'typed-import',
    ]));

    $collection = Collection::query()->where('name', 'typed-import')->firstOrFail();

    expect($collection->fields()->where('name', 'price')->firstOrFail()->type)->toBe(FieldTypeEnum::Number)
        ->and($collection->fields()->where('name', 'active')->firstOrFail()->type)->toBe(FieldTypeEnum::Boolean);
});

test('csv upsert updates an existing item', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    foreach (['sku', 'title'] as $fieldName) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => $fieldName,
            'type' => FieldTypeEnum::String,
            'translatable' => false,
        ]);
    }
    $collection->load('fields');
    $item = phaseTwoWriteItem($collection, ['sku' => 'A1', 'title' => 'Old']);
    $attachment = phaseTwoAttachment($user, 'upsert.csv', "sku,title\nA1,New\n", 'text/csv');

    $result = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_id' => $collection->id,
        'upsert_key' => 'sku',
    ]));

    expect($result)->toContain('"updated": 1')
        ->and($collection->items()->count())->toBe(1)
        ->and(app(CollectionItemValuesAssembler::class)->assemble($item->fresh())['title'])->toBe('New');
});

test('remote json dry run writes nothing and upsert updates existing item', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);
    Http::fake([
        'https://example.com/products' => Http::response([
            ['sku' => 'A1', 'title' => 'Remote'],
        ]),
    ]);

    $preview = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/products',
        'collection_name' => 'remote-preview',
        'dry_run' => true,
    ]));
    expect($preview)->toContain('"dry_run": true')
        ->and(Collection::query()->where('name', 'remote-preview')->exists())->toBeFalse();

    $collection = Collection::factory()->create();
    foreach (['sku', 'title'] as $fieldName) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => $fieldName,
            'type' => FieldTypeEnum::String,
            'translatable' => false,
        ]);
    }
    $collection->load('fields');
    $item = phaseTwoWriteItem($collection, ['sku' => 'A1', 'title' => 'Local']);

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/products',
        'collection_id' => $collection->id,
        'upsert_key' => 'sku',
    ]));

    expect($result)->toContain('"updated": 1')
        ->and($collection->items()->count())->toBe(1)
        ->and(app(CollectionItemValuesAssembler::class)->assemble($item->fresh())['title'])->toBe('Remote');
});

test('xlsx attachment imports rows', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $attachment = phaseTwoAttachment(
        $user,
        'products.xlsx',
        '',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    $spreadsheet = new Spreadsheet;
    $spreadsheet->getActiveSheet()->fromArray([
        ['sku', 'price'],
        ['X1', 42],
    ]);
    (new Xlsx($spreadsheet))->save(Storage::disk('local')->path($attachment->path));
    $attachment->update(['size' => Storage::disk('local')->size($attachment->path)]);

    $result = (string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_name' => 'excel-products',
    ]));

    expect($result)->toContain('"created": 1')
        ->and(Collection::query()->where('name', 'excel-products')->firstOrFail()->items()->count())->toBe(1);
});

test('pdf extraction returns text and enforces create permission', function () {
    $allowed = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $attachment = phaseTwoAttachment($allowed, 'document.pdf', phaseTwoPdf('Phase Two PDF'), 'application/pdf');
    $this->actingAs($allowed);

    $result = (string) (new ExtractPdfText)->handle(new Request(['attachment_id' => $attachment->id]));
    expect($result)->toContain('Phase Two PDF');

    $denied = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $deniedAttachment = phaseTwoAttachment($denied, 'denied.pdf', phaseTwoPdf('Secret'), 'application/pdf');
    $this->actingAs($denied);

    expect((string) (new ExtractPdfText)->handle(new Request(['attachment_id' => $deniedAttachment->id])))
        ->toContain('Permesso mancante');
});

test('collection export query bulk actions and duplicate work', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Products', 'slug' => 'products']);
    foreach (['status', 'title'] as $fieldName) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => $fieldName,
            'type' => FieldTypeEnum::String,
            'translatable' => false,
        ]);
    }
    $collection->load('fields');
    phaseTwoWriteItem($collection, ['status' => 'draft', 'title' => 'One']);
    phaseTwoWriteItem($collection, ['status' => 'draft', 'title' => 'Two']);
    phaseTwoWriteItem($collection, ['status' => 'published', 'title' => 'Three']);

    $query = (string) (new QueryCollectionItems)->handle(new Request([
        'collection_id' => $collection->id,
        'filter_json' => '{"status":"published"}',
    ]));
    $export = (string) (new ExportCollection)->handle(new Request([
        'collection_id' => $collection->id,
        'format' => 'csv',
    ]));

    expect($query)->toContain('Three')->not->toContain('"title": "One"')
        ->and($export)->toContain('status,title')->toContain('published,Three');

    $bulkUpdate = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'bulk_update',
        'collection_id' => $collection->id,
        'filter_field' => 'status',
        'filter_value' => 'draft',
        'data_json' => '{"status":"archived"}',
        'limit' => 10,
    ]));
    expect($bulkUpdate)->toContain('"updated": 2');

    $duplicate = (string) (new ManageCollections)->handle(new Request([
        'action' => 'duplicate',
        'collection_id' => $collection->id,
        'with_sample' => true,
    ]));
    expect($duplicate)->toContain('"fields_copied": 2')
        ->and(Collection::query()->where('slug', 'products-copy')->firstOrFail()->items()->count())->toBe(3);

    $bulkDelete = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'bulk_delete',
        'collection_id' => $collection->id,
        'filter_field' => 'status',
        'filter_value' => 'archived',
        'limit' => 10,
    ]));
    expect($bulkDelete)->toContain('"deleted": 2')
        ->and($collection->items()->count())->toBe(1);
});

test('relation options are listed and collection reads enforce permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $related = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $related->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    $related->load('fields');
    phaseTwoWriteItem($related, ['title' => 'Option Alpha']);

    $owner = Collection::factory()->create();
    $relationField = CollectionField::factory()->create([
        'collection_id' => $owner->id,
        'name' => 'related_item',
        'type' => FieldTypeEnum::Relation,
        'translatable' => false,
        'settings' => [
            'related_collection_id' => $related->id,
            'display_field' => 'title',
        ],
    ]);

    $options = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'list_relation_options',
        'field_id' => $relationField->id,
    ]));
    expect($options)->toContain('Option Alpha');

    $denied = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $this->actingAs($denied);

    expect((string) (new QueryCollectionItems)->handle(new Request([
        'collection_id' => $related->id,
    ])))->toContain('Permesso mancante')
        ->and((string) (new ExportCollection)->handle(new Request([
            'collection_id' => $related->id,
            'format' => 'json',
        ])))->toContain('Permesso mancante');
});

test('user restore and force delete enforce permissions', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanRestoreUsers->value,
        PermissionEnum::CanForceDeleteUsers->value,
    ]);
    $target = User::factory()->create();
    $target->delete();
    $this->actingAs($actor);

    expect((string) (new ManageUsers)->handle(new Request([
        'action' => 'restore',
        'user_id' => $target->id,
    ])))->toContain('"ok": true');

    expect((string) (new ManageUsers)->handle(new Request([
        'action' => 'force_delete',
        'user_id' => $target->id,
    ])))->toContain('"ok": true')
        ->and(User::query()->withTrashed()->find($target->id))->toBeNull();

    $deniedActor = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $deniedTarget = User::factory()->create();
    $deniedTarget->delete();
    $this->actingAs($deniedActor);

    expect((string) (new ManageUsers)->handle(new Request([
        'action' => 'restore',
        'user_id' => $deniedTarget->id,
    ])))->toContain('Permesso mancante');
});

test('chat attachment can be saved to file manager', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);
    $attachment = phaseTwoAttachment($user, 'notes.txt', 'hello file manager', 'text/plain');

    $result = (string) (new ManageFiles)->handle(new Request([
        'action' => 'save_attachment',
        'attachment_id' => $attachment->id,
    ]));

    expect($result)->toContain('"ok": true')
        ->and(File::query()->where('name', 'notes.txt')->exists())->toBeTrue()
        ->and(AiChatAttachment::query()->find($attachment->id))->toBeNull();
});
