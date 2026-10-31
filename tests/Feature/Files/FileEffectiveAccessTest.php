<?php

use App\Enums\FileAccessEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Services\Files\FileEffectiveAccessService;
use App\Services\FileService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('assets');
});

it('denormalizes effective_access on create and access update', function (): void {
    $file = makeStoredFile('denorm.jpg');
    expect($file->fresh()->effective_access)->toBe(FileAccessEnum::Public->value);

    $file->update(['access' => FileAccessEnum::Private->value]);
    expect($file->fresh()->effective_access)->toBe(FileAccessEnum::Private->value)
        ->and($file->fresh()->isEffectivelyPrivate())->toBeTrue();
});

it('propagates folder access changes to inheriting descendants', function (): void {
    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'vault-ea',
        'path' => '/vault-ea',
        'disk' => 'assets',
        'access' => FileAccessEnum::Public->value,
    ]);

    $child = makeStoredFile('inside-ea.jpg');
    $child->update([
        'parent_id' => $folder->id,
        'access' => null,
        'path' => '/vault-ea/inside-ea.jpg',
    ]);

    expect($child->fresh()->effective_access)->toBe(FileAccessEnum::Public->value);

    $folder->update(['access' => FileAccessEnum::Private->value]);

    expect($folder->fresh()->effective_access)->toBe(FileAccessEnum::Private->value)
        ->and($child->fresh()->effective_access)->toBe(FileAccessEnum::Private->value);
});

it('updates effective_access when moving under a private parent', function (): void {
    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'private-parent',
        'path' => '/private-parent',
        'disk' => 'assets',
        'access' => FileAccessEnum::Private->value,
    ]);

    $file = makeStoredFile('movable.jpg');
    expect($file->fresh()->effective_access)->toBe(FileAccessEnum::Public->value);

    app(FileService::class)->move($file, $folder->id);

    expect($file->fresh()->effective_access)->toBe(FileAccessEnum::Private->value);
});

it('hides inherited private files from list via denormalized column', function (): void {
    grantPublicFileActions([FilePermissionActionEnum::Read]);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'list-vault',
        'path' => '/list-vault',
        'disk' => 'assets',
        'access' => FileAccessEnum::Private->value,
    ]);

    $hidden = makeStoredFile('hidden-list.jpg');
    $hidden->update([
        'parent_id' => $folder->id,
        'access' => null,
        'path' => '/list-vault/hidden-list.jpg',
    ]);

    $visible = makeStoredFile('visible-list.jpg');

    $this->getJson('/api/v1/files')
        ->assertOk()
        ->assertJsonFragment(['filename' => 'visible-list.jpg'])
        ->assertJsonMissing(['filename' => 'hidden-list.jpg']);
});

it('backfill command is idempotent', function (): void {
    $file = makeStoredFile('backfill.jpg');
    File::query()->whereKey($file->id)->update(['effective_access' => null]);

    Artisan::call('files:backfill-effective-access');
    expect($file->fresh()->effective_access)->toBe(FileAccessEnum::Public->value);

    $changed = app(FileEffectiveAccessService::class)->backfillAll();
    expect($changed)->toBe(0);
});
