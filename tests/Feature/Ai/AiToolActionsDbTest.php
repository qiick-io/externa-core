<?php

use App\Ai\Support\AiActivityLogger;
use App\Ai\Tools\ExportCollection;
use App\Ai\Tools\ExtractPdfText;
use App\Ai\Tools\GetImportJobStatus;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Ai\Tools\ManageAiSyncSources;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageRoles;
use App\Ai\Tools\ManageUsers;
use App\Ai\Tools\QueryCollectionItems;
use App\Ai\Tools\RollbackLastAiTurn;
use App\Ai\Tools\SearchSimilarItems;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\ImportCollectionJob;
use App\Models\AiChatAttachment;
use App\Models\AiSyncSource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Collections\CollectionItemValuesAssembler;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Tools\Request;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    $this->withoutVite();
    Storage::fake('local');
    Storage::fake('assets');
    Cache::clear();

    $this->aiToolActor = grantAiPermissions(
        User::factory()->create(),
        array_map(
            fn (PermissionEnum $permission): string => $permission->value,
            PermissionEnum::cases(),
        ),
    );
    $this->actingAs($this->aiToolActor);
});

function aiToolDbAttachment(User $user, string $name, string $content, string $mimeType): AiChatAttachment
{
    $path = "ai-chat-attachments/{$user->id}/".Str::uuid()."-{$name}";
    Storage::disk('local')->put($path, $content);

    return AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => $name,
        'mime_type' => $mimeType,
        'disk' => 'local',
        'path' => $path,
        'size' => strlen($content),
        'expires_at' => now()->addHour(),
    ]);
}

function aiToolDbPdf(string $text): string
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

test('ai tool actions mutate and read expected database state', function () {
    $unique = uniqid('ai-db-', true);
    $invoke = function (object $tool, array $payload): array {
        $result = (string) $tool->handle(new Request($payload));

        expect($result)->not->toContain('Permesso mancante')
            ->and(str_starts_with($result, 'Error:'))->toBeFalse();

        $decoded = json_decode($result, true);
        expect($decoded)->toBeArray();

        return $decoded;
    };

    $collections = new ManageCollections;
    $collectionResult = $invoke($collections, [
        'action' => 'create',
        'name' => "{$unique} products",
        'slug' => "{$unique}-products",
    ]);
    $collectionId = $collectionResult['collection']['id'];
    $this->assertDatabaseHas('collections', [
        'id' => $collectionId,
        'slug' => "{$unique}-products",
    ]);

    $titleFieldResult = $invoke($collections, [
        'action' => 'create_field',
        'collection_id' => $collectionId,
        'name' => 'title',
        'type' => FieldTypeEnum::String->value,
    ]);
    $titleFieldId = $titleFieldResult['field']['id'];
    $invoke($collections, [
        'action' => 'update_field',
        'collection_id' => $collectionId,
        'field_id' => $titleFieldId,
        'translatable' => true,
    ]);
    $this->assertDatabaseHas('collections_fields', [
        'id' => $titleFieldId,
        'translatable' => true,
    ]);
    $invoke($collections, [
        'action' => 'update_field',
        'collection_id' => $collectionId,
        'field_id' => $titleFieldId,
        'translatable' => false,
    ]);

    $statusFieldResult = $invoke($collections, [
        'action' => 'create_field',
        'collection_id' => $collectionId,
        'name' => 'status',
        'type' => FieldTypeEnum::String->value,
    ]);
    $temporaryFieldResult = $invoke($collections, [
        'action' => 'create_field',
        'collection_id' => $collectionId,
        'name' => 'temporary',
        'type' => FieldTypeEnum::String->value,
    ]);
    $invoke($collections, [
        'action' => 'delete_field',
        'collection_id' => $collectionId,
        'field_id' => $temporaryFieldResult['field']['id'],
    ]);
    $this->assertDatabaseMissing('collections_fields', ['id' => $temporaryFieldResult['field']['id']]);

    $updatedCollectionName = "{$unique} catalog";
    $invoke($collections, [
        'action' => 'update',
        'collection_id' => $collectionId,
        'name' => $updatedCollectionName,
    ]);
    $collectionGet = $invoke($collections, [
        'action' => 'get',
        'collection_id' => $collectionId,
    ]);
    $collectionList = $invoke($collections, [
        'action' => 'list',
    ]);
    expect($collectionGet['name'])->toBe($updatedCollectionName)
        ->and(collect($collectionList['collections'])->pluck('id'))->toContain($collectionId);

    $items = new ManageCollectionItems;
    $firstItemResult = $invoke($items, [
        'action' => 'create',
        'collection_id' => $collectionId,
        'data_json' => json_encode(['title' => 'Alpha', 'status' => 'published']),
    ]);
    $secondItemResult = $invoke($items, [
        'action' => 'create',
        'collection_id' => $collectionId,
        'data_json' => json_encode(['title' => 'Beta', 'status' => 'draft']),
    ]);
    $thirdItemResult = $invoke($items, [
        'action' => 'create',
        'collection_id' => $collectionId,
        'data_json' => json_encode(['title' => 'Gamma', 'status' => 'draft']),
    ]);
    $firstItemId = $firstItemResult['item']['id'];
    $secondItemId = $secondItemResult['item']['id'];
    $thirdItemId = $thirdItemResult['item']['id'];

    $invoke($items, [
        'action' => 'update',
        'item_id' => $firstItemId,
        'data_json' => json_encode(['title' => 'Alpha updated']),
    ]);
    $itemGet = $invoke($items, ['action' => 'get', 'item_id' => $firstItemId]);
    $itemList = $invoke($items, [
        'action' => 'list',
        'collection_id' => $collectionId,
    ]);
    expect($itemGet['data']['title'])->toBe('Alpha updated')
        ->and(collect($itemList['items'])->pluck('id'))->toContain($firstItemId, $secondItemId, $thirdItemId);

    $bulkUpdate = $invoke($items, [
        'action' => 'bulk_update',
        'collection_id' => $collectionId,
        'filter_field' => 'status',
        'filter_value' => 'draft',
        'data_json' => json_encode(['status' => 'archived']),
        'limit' => 10,
    ]);
    expect($bulkUpdate['updated'])->toBe(2);

    $bulkDelete = $invoke($items, [
        'action' => 'bulk_delete',
        'collection_id' => $collectionId,
        'filter_field' => 'status',
        'filter_value' => 'archived',
        'limit' => 10,
    ]);
    expect($bulkDelete['deleted'])->toBe(2);
    $this->assertSoftDeleted('collections_items', ['id' => $secondItemId]);
    $this->assertSoftDeleted('collections_items', ['id' => $thirdItemId]);

    $invoke($items, ['action' => 'delete', 'item_id' => $firstItemId]);
    $this->assertSoftDeleted('collections_items', ['id' => $firstItemId]);
    $invoke($items, ['action' => 'restore', 'item_id' => $firstItemId]);
    $this->assertDatabaseHas('collections_items', ['id' => $firstItemId, 'deleted_at' => null]);
    $invoke($items, ['action' => 'delete', 'item_id' => $firstItemId]);
    $invoke($items, ['action' => 'force_delete', 'item_id' => $firstItemId]);
    expect(CollectionItem::query()->withTrashed()->find($firstItemId))->toBeNull();

    $readableItemResult = $invoke($items, [
        'action' => 'create',
        'collection_id' => $collectionId,
        'data_json' => json_encode(['title' => 'Needle product', 'status' => 'published']),
    ]);
    $readableItemId = $readableItemResult['item']['id'];

    $queryResult = $invoke(new QueryCollectionItems, [
        'collection_id' => $collectionId,
        'filter_json' => json_encode(['status' => 'published']),
    ]);
    $similarResult = $invoke(new SearchSimilarItems, [
        'collection_id' => $collectionId,
        'query' => 'Needle',
    ]);
    $exportResult = $invoke(new ExportCollection, [
        'collection_id' => $collectionId,
        'format' => 'json',
    ]);
    expect(collect($queryResult['rows'])->pluck('id'))->toContain($readableItemId)
        ->and(collect($similarResult['items'])->pluck('id'))->toContain($readableItemId)
        ->and($exportResult['rows_exported'])->toBe(1)
        ->and($exportResult['content'])->toContain('Needle product');

    $duplicateResult = $invoke($collections, [
        'action' => 'duplicate',
        'collection_id' => $collectionId,
        'with_sample' => true,
    ]);
    $duplicateId = $duplicateResult['collection']['id'];
    expect(Collection::query()->findOrFail($duplicateId)->items()->count())->toBe(1);

    $lifecycleCollection = $invoke($collections, [
        'action' => 'create',
        'name' => "{$unique} lifecycle",
        'slug' => "{$unique}-lifecycle",
    ]);
    $lifecycleCollectionId = $lifecycleCollection['collection']['id'];
    $invoke($collections, ['action' => 'delete', 'collection_id' => $lifecycleCollectionId]);
    $this->assertSoftDeleted('collections', ['id' => $lifecycleCollectionId]);
    $invoke($collections, ['action' => 'restore', 'collection_id' => $lifecycleCollectionId]);
    $this->assertDatabaseHas('collections', ['id' => $lifecycleCollectionId, 'deleted_at' => null]);
    $invoke($collections, ['action' => 'delete', 'collection_id' => $lifecycleCollectionId]);
    $invoke($collections, ['action' => 'force_delete', 'collection_id' => $lifecycleCollectionId]);
    expect(Collection::query()->withTrashed()->find($lifecycleCollectionId))->toBeNull();

    $roles = new ManageRoles;
    $permissionList = $invoke($roles, [
        'action' => 'list_permissions',
        'query' => 'collections',
    ]);
    expect(collect($permissionList['permissions'])->pluck('name'))
        ->toContain(PermissionEnum::CanShowCollections->value);

    $roleName = "{$unique}-manager";
    $roleResult = $invoke($roles, [
        'action' => 'create',
        'name' => $roleName,
        'permission_names_json' => json_encode([
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanCreateCollections->value,
        ]),
    ]);
    $roleId = $roleResult['role']['id'];
    $this->assertDatabaseHas('roles', ['id' => $roleId, 'name' => $roleName]);
    expect(Role::query()->findOrFail($roleId)->hasPermissionTo(PermissionEnum::CanCreateCollections->value))->toBeTrue();

    $roleGet = $invoke($roles, ['action' => 'get', 'role_id' => $roleId]);
    $updatedRoleName = "{$unique}-editor";
    $invoke($roles, [
        'action' => 'update',
        'role_id' => $roleId,
        'name' => $updatedRoleName,
        'permission_names_json' => json_encode([
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanEditCollections->value,
        ]),
    ]);
    $roleList = $invoke($roles, ['action' => 'list', 'query' => $unique]);
    expect($roleGet['role']['name'])->toBe($roleName)
        ->and(collect($roleList['roles'])->pluck('id'))->toContain($roleId)
        ->and(Role::query()->findOrFail($roleId)->hasPermissionTo(PermissionEnum::CanEditCollections->value))->toBeTrue();

    $groups = new ManageGroups;
    $groupResult = $invoke($groups, [
        'action' => 'create',
        'name' => "{$unique} team",
        'description' => 'Initial team',
        'role_names_json' => json_encode([$updatedRoleName]),
        'user_ids_json' => json_encode([$this->aiToolActor->id]),
    ]);
    $groupId = $groupResult['group']['id'];
    $this->assertDatabaseHas('user_groups', ['id' => $groupId, 'name' => "{$unique} team"]);
    expect(UserGroup::query()->findOrFail($groupId)->roles()->pluck('name'))->toContain($updatedRoleName);

    $invoke($groups, [
        'action' => 'update',
        'group_id' => $groupId,
        'description' => 'Updated team',
        'user_ids_json' => json_encode([]),
    ]);
    $groupGet = $invoke($groups, ['action' => 'get', 'group_id' => $groupId]);
    $groupList = $invoke($groups, ['action' => 'list', 'query' => $unique]);
    expect($groupGet['group']['description'])->toBe('Updated team')
        ->and(collect($groupList['groups'])->pluck('id'))->toContain($groupId);
    $invoke($groups, ['action' => 'delete', 'group_id' => $groupId]);
    $this->assertSoftDeleted('user_groups', ['id' => $groupId]);
    $invoke($groups, ['action' => 'restore', 'group_id' => $groupId]);
    $this->assertDatabaseHas('user_groups', ['id' => $groupId, 'deleted_at' => null]);
    $invoke($groups, ['action' => 'delete', 'group_id' => $groupId]);
    $invoke($groups, ['action' => 'force_delete', 'group_id' => $groupId]);
    expect(UserGroup::query()->withTrashed()->find($groupId))->toBeNull();

    $users = new ManageUsers;
    $managedEmail = "{$unique}@example.com";
    $managedUserResult = $invoke($users, [
        'action' => 'create',
        'first_name' => 'Managed',
        'last_name' => 'User',
        'email' => $managedEmail,
        'username' => "{$unique}-user",
        'password' => 'Strong!Passphrase123',
        'role_names_json' => json_encode([$updatedRoleName]),
    ]);
    $managedUserId = $managedUserResult['user']['id'];
    $this->assertDatabaseHas('users', ['id' => $managedUserId, 'email' => $managedEmail]);
    expect(User::query()->findOrFail($managedUserId)->hasRole($updatedRoleName))->toBeTrue();

    $userGet = $invoke($users, ['action' => 'get', 'user_id' => $managedUserId]);
    $invoke($users, [
        'action' => 'update',
        'user_id' => $managedUserId,
        'first_name' => 'Updated',
        'is_active' => false,
        'role_names_json' => json_encode([$updatedRoleName]),
    ]);
    $userList = $invoke($users, ['action' => 'list', 'query' => $managedEmail]);
    expect($userGet['user']['email'])->toBe($managedEmail)
        ->and(collect($userList['users'])->pluck('id'))->toContain($managedUserId);
    $this->assertDatabaseHas('users', ['id' => $managedUserId, 'first_name' => 'Updated', 'is_active' => false]);
    $invoke($users, ['action' => 'delete', 'user_id' => $managedUserId]);
    $this->assertSoftDeleted('users', ['id' => $managedUserId]);
    $invoke($users, ['action' => 'restore', 'user_id' => $managedUserId]);
    $this->assertDatabaseHas('users', ['id' => $managedUserId, 'deleted_at' => null]);
    $invoke($users, ['action' => 'delete', 'user_id' => $managedUserId]);
    $invoke($users, ['action' => 'force_delete', 'user_id' => $managedUserId]);
    expect(User::query()->withTrashed()->find($managedUserId))->toBeNull();

    $invoke($roles, ['action' => 'delete', 'role_id' => $roleId]);
    $this->assertDatabaseMissing('roles', ['id' => $roleId]);

    $files = new ManageFiles;
    $parentFolderResult = $invoke($files, [
        'action' => 'create_folder',
        'name' => "{$unique}-parent",
    ]);
    $parentFolderId = $parentFolderResult['file']['id'];
    $folderResult = $invoke($files, [
        'action' => 'create_folder',
        'name' => "{$unique}-folder",
    ]);
    $folderId = $folderResult['file']['id'];
    $renamedFolder = "{$unique}-renamed";
    $invoke($files, [
        'action' => 'rename',
        'file_id' => $folderId,
        'name' => $renamedFolder,
    ]);
    $invoke($files, [
        'action' => 'move',
        'file_id' => $folderId,
        'target_parent_id' => $parentFolderId,
    ]);
    $fileList = $invoke($files, [
        'action' => 'list',
        'parent_id' => $parentFolderId,
    ]);
    expect(collect($fileList['files'])->pluck('id'))->toContain($folderId);
    $this->assertDatabaseHas('files', [
        'id' => $folderId,
        'name' => $renamedFolder,
        'parent_id' => $parentFolderId,
    ]);
    $invoke($files, ['action' => 'delete', 'file_id' => $folderId]);
    $this->assertSoftDeleted('files', ['id' => $folderId]);
    $invoke($files, ['action' => 'restore', 'file_id' => $folderId]);
    $this->assertDatabaseHas('files', ['id' => $folderId, 'deleted_at' => null]);
    $invoke($files, ['action' => 'delete', 'file_id' => $folderId]);
    $invoke($files, ['action' => 'force_delete', 'file_id' => $folderId]);
    expect(File::query()->withTrashed()->find($folderId))->toBeNull();

    $fileAttachment = aiToolDbAttachment(
        $this->aiToolActor,
        "{$unique}.txt",
        'saved attachment',
        'text/plain',
    );
    $savedFileResult = $invoke($files, [
        'action' => 'save_attachment',
        'attachment_id' => $fileAttachment->id,
        'parent_id' => $parentFolderId,
    ]);
    $this->assertDatabaseHas('files', [
        'id' => $savedFileResult['file']['id'],
        'name' => "{$unique}.txt",
    ]);
    $this->assertDatabaseMissing('ai_chat_attachments', ['id' => $fileAttachment->id]);

    $csvCollectionName = "{$unique} csv";
    $csvAttachment = aiToolDbAttachment(
        $this->aiToolActor,
        "{$unique}.csv",
        "sku,title\nCSV-1,Imported CSV item\n",
        'text/csv',
    );
    $csvResult = $invoke(new ImportCollectionCsv, [
        'attachment_id' => $csvAttachment->id,
        'collection_name' => $csvCollectionName,
        'force_sync' => true,
    ]);
    $csvCollection = Collection::query()->findOrFail($csvResult['collection_id']);
    expect($csvCollection->items()->count())->toBe(1);
    $this->assertDatabaseMissing('ai_chat_attachments', ['id' => $csvAttachment->id]);

    $pdfAttachment = aiToolDbAttachment(
        $this->aiToolActor,
        "{$unique}.pdf",
        aiToolDbPdf('Database tool PDF'),
        'application/pdf',
    );
    $pdfResult = $invoke(new ExtractPdfText, ['attachment_id' => $pdfAttachment->id]);
    expect($pdfResult['text'])->toContain('Database tool PDF');
    $this->assertDatabaseHas('ai_chat_attachments', ['id' => $pdfAttachment->id]);

    Http::fake([
        'https://example.com/ai-tool-items' => Http::response([
            ['sku' => 'REMOTE-1', 'title' => 'Imported remote item'],
        ]),
    ]);
    $remoteCollectionName = "{$unique} remote";
    $remoteResult = $invoke(new ImportRemoteJson, [
        'url' => 'https://example.com/ai-tool-items',
        'collection_name' => $remoteCollectionName,
        'force_sync' => true,
    ]);
    expect(Collection::query()->findOrFail($remoteResult['collection_id'])->items()->count())->toBe(1);

    $syncSources = new ManageAiSyncSources;
    $syncSourceResult = $invoke($syncSources, [
        'action' => 'create',
        'collection_id' => $collectionId,
        'url' => 'https://93.184.216.34/ai-tool-items',
        'interval_minutes' => 15,
    ]);
    $syncSourceId = $syncSourceResult['source']['id'];
    $syncList = $invoke($syncSources, ['action' => 'list']);
    expect(collect($syncList['sources'])->pluck('id'))->toContain($syncSourceId);
    $invoke($syncSources, [
        'action' => 'update',
        'source_id' => $syncSourceId,
        'interval_minutes' => 30,
    ]);
    $invoke($syncSources, ['action' => 'disable', 'source_id' => $syncSourceId]);
    expect(AiSyncSource::query()->findOrFail($syncSourceId)->enabled)->toBeFalse();
    $invoke($syncSources, ['action' => 'enable', 'source_id' => $syncSourceId]);
    expect(AiSyncSource::query()->findOrFail($syncSourceId)->enabled)->toBeTrue();
    $invoke($syncSources, ['action' => 'delete', 'source_id' => $syncSourceId]);
    $this->assertDatabaseMissing('ai_sync_sources', ['id' => $syncSourceId]);

    $importJob = new ImportCollectionJob(
        userId: $this->aiToolActor->id,
        conversationId: null,
        sourceType: 'remote_json',
        url: 'https://example.com/status-only',
        collectionId: $collectionId,
    );
    $importJob->setQueuedTotal(1);
    $jobStatus = $invoke(new GetImportJobStatus, ['job_id' => $importJob->jobId]);
    expect($jobStatus['status'])->toBe('queued')
        ->and($jobStatus['total'])->toBe(1)
        ->and($jobStatus)->not->toHaveKey('user_id');

    $conversation = Conversation::query()->create([
        'id' => (string) Str::uuid(),
        'user_id' => $this->aiToolActor->id,
        'title' => "{$unique} rollback",
    ]);
    $rollbackCollection = Collection::factory()->create(['name' => "{$unique} rollback collection"]);
    CollectionField::factory()->create([
        'collection_id' => $rollbackCollection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    AiActivityLogger::prompt($this->aiToolActor, 'Create rollback item', $conversation->id);
    request()->merge(['conversation_id' => $conversation->id]);
    $rollbackItemResult = $invoke($items, [
        'action' => 'create',
        'collection_id' => $rollbackCollection->id,
        'data_json' => json_encode(['title' => 'Rollback me']),
    ]);
    $rollbackItemId = $rollbackItemResult['item']['id'];
    $rollbackResult = $invoke(new RollbackLastAiTurn, [
        'conversation_id' => $conversation->id,
    ]);
    expect($rollbackResult['items_soft_deleted'])->toBe(1);
    $this->assertSoftDeleted('collections_items', ['id' => $rollbackItemId]);

    $collection = Collection::query()->with('fields')->findOrFail($collectionId);
    $storedData = app(CollectionItemValuesAssembler::class)->assemble(
        CollectionItem::query()->findOrFail($readableItemId),
    );
    expect($collection->fields->pluck('id'))->toContain($titleFieldId, $statusFieldResult['field']['id'])
        ->and($storedData)->toMatchArray([
            'title' => 'Needle product',
            'status' => 'published',
        ]);
});
