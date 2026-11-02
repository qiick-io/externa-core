<?php

declare(strict_types=1);

namespace Tests\Feature\Ai\Security\Support;

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Illuminate\Support\Facades\Storage;

/**
 * Shared fixtures for the AI security suite (injection CMS content + role actors).
 */
final class AiSecurityFixture
{
    /**
     * @return array{
     *     public_collection: Collection,
     *     private_collection: Collection,
     *     public_item: CollectionItem,
     *     private_item: CollectionItem,
     *     file: File,
     *     context: array{
     *         public_collection_id: int,
     *         private_collection_id: int,
     *         public_item_id: int,
     *         private_item_id: int,
     *         file_id: int
     *     }
     * }
     */
    public static function seedCmsWithInjections(): array
    {
        Storage::fake('assets');

        $public = Collection::query()->create([
            'name' => 'Public Articles',
            'slug' => 'sec-public-'.uniqid(),
            'is_singleton' => false,
            'sort_order' => 1,
        ]);
        CollectionField::factory()->create([
            'collection_id' => $public->id,
            'name' => 'title',
            'type' => FieldTypeEnum::String,
        ]);
        CollectionField::factory()->create([
            'collection_id' => $public->id,
            'name' => 'body',
            'type' => FieldTypeEnum::Textarea,
        ]);

        $private = Collection::query()->create([
            'name' => 'Private HR',
            'slug' => 'sec-private-'.uniqid(),
            'is_singleton' => false,
            'sort_order' => 2,
        ]);
        CollectionField::factory()->create([
            'collection_id' => $private->id,
            'name' => 'title',
            'type' => FieldTypeEnum::String,
        ]);
        CollectionField::factory()->create([
            'collection_id' => $private->id,
            'name' => 'salary',
            'type' => FieldTypeEnum::String,
        ]);

        $normalizer = app(CollectionItemDataNormalizerService::class);
        $writer = app(CollectionItemValuesWriterService::class);

        $injectionBodies = array_map(
            static fn (array $payload): string => $payload['body'],
            array_values(InjectionPayloadCatalog::all()),
        );

        $publicItem = $public->items()->create([]);
        $writer->sync($publicItem, $public, $normalizer->normalize($public, [
            'title' => 'Injection fixture',
            'body' => implode("\n---\n", $injectionBodies),
        ], true));

        $privateItem = $private->items()->create([]);
        $writer->sync($privateItem, $private, $normalizer->normalize($private, [
            'title' => 'CEO',
            'salary' => '999999',
        ], true));

        Storage::disk('assets')->put('2026/11/sec-fixture.txt', 'fixture');
        $file = File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => 'sec-fixture.txt',
            'path' => '/sec-fixture.txt',
            'disk' => 'assets',
            'storage_path' => '2026/11/sec-fixture.txt',
            'mime_type' => 'text/plain',
            'size' => 7,
            'hash' => hash('sha256', 'fixture'),
        ]);

        return [
            'public_collection' => $public,
            'private_collection' => $private,
            'public_item' => $publicItem->fresh(),
            'private_item' => $privateItem->fresh(),
            'file' => $file,
            'context' => [
                'public_collection_id' => $public->id,
                'private_collection_id' => $private->id,
                'public_item_id' => $publicItem->id,
                'private_item_id' => $privateItem->id,
                'file_id' => $file->id,
            ],
        ];
    }

    /**
     * @return array{viewer: User, editor: User, admin: User, limited: User}
     */
    public static function actors(): array
    {
        $viewer = grantAiPermissions(User::factory()->create(['email' => 'sec-viewer-'.uniqid().'@example.test']), [
            PermissionEnum::CanUseAi->value,
            PermissionEnum::CanShowCollections->value,
        ]);

        $editor = grantAiPermissions(User::factory()->create(['email' => 'sec-editor-'.uniqid().'@example.test']), [
            PermissionEnum::CanUseAi->value,
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanCreateCollections->value,
            PermissionEnum::CanEditCollections->value,
        ]);

        $admin = grantAiPermissions(User::factory()->create(['email' => 'sec-admin-'.uniqid().'@example.test']), [
            PermissionEnum::CanUseAi->value,
            ...allCollectionPermissions(),
            ...[
                PermissionEnum::CanShowFiles->value,
                PermissionEnum::CanCreateFiles->value,
                PermissionEnum::CanEditFiles->value,
                PermissionEnum::CanDeleteFiles->value,
                PermissionEnum::CanRestoreFiles->value,
                PermissionEnum::CanForceDeleteFiles->value,
                PermissionEnum::CanShowUsers->value,
                PermissionEnum::CanCreateUsers->value,
                PermissionEnum::CanEditUsers->value,
                PermissionEnum::CanDeleteUsers->value,
                PermissionEnum::CanShowRoles->value,
                PermissionEnum::CanCreateRoles->value,
                PermissionEnum::CanEditRoles->value,
                PermissionEnum::CanDeleteRoles->value,
                PermissionEnum::CanShowGroups->value,
                PermissionEnum::CanCreateGroups->value,
                PermissionEnum::CanEditGroups->value,
                PermissionEnum::CanDeleteGroups->value,
                PermissionEnum::CanShowActivityLogs->value,
            ],
        ]);

        // Limited "API token" style actor: AI + files only (no collections).
        $limited = grantAiPermissions(User::factory()->create(['email' => 'sec-limited-'.uniqid().'@example.test']), [
            PermissionEnum::CanUseAi->value,
            PermissionEnum::CanShowFiles->value,
        ]);

        return compact('viewer', 'editor', 'admin', 'limited');
    }
}
