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
use Illuminate\Support\Facades\DB;
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

it('resolves ancestors outside a backfill chunk without a query per row', function (): void {
    $root = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'deep-root',
        'path' => '/deep-root',
        'disk' => 'assets',
        'access' => FileAccessEnum::Private->value,
    ]);
    $children = collect(range(1, 12))->map(fn (int $index): File => File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => "deep-{$index}",
        'path' => "/deep-root/deep-{$index}",
        'disk' => 'assets',
        'parent_id' => $root->id,
    ]));
    File::query()->update(['effective_access' => null]);

    DB::enableQueryLog();
    // Chunks of 2: every chunk after the first needs the root from outside it.
    $changed = app(FileEffectiveAccessService::class)->backfillAll(2);
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($changed)->toBe(13)
        ->and($children->every(fn (File $child): bool => $child->fresh()->effective_access === FileAccessEnum::Private->value))->toBeTrue()
        // 7 chunks: select + one ancestor lookup + one update each, plus the closing empty select.
        ->and($queries)->toBeLessThanOrEqual(7 * 3 + 1);
});

it('refreshes a folder subtree with one update per access value', function (): void {
    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'bulk-vault',
        'path' => '/bulk-vault',
        'disk' => 'assets',
        'access' => FileAccessEnum::Public->value,
    ]);
    foreach (range(1, 10) as $index) {
        File::query()->create([
            'type' => FileTypeEnum::Folder,
            'name' => "bulk-{$index}",
            'path' => "/bulk-vault/bulk-{$index}",
            'disk' => 'assets',
            'parent_id' => $folder->id,
        ]);
    }

    File::query()->whereKey($folder->id)->update(['access' => FileAccessEnum::Private->value]);

    DB::enableQueryLog();
    app(FileEffectiveAccessService::class)->refreshDescendants($folder->fresh());
    $updates = collect(DB::getQueryLog())->filter(fn (array $query): bool => str_starts_with(strtolower($query['query']), 'update'));
    DB::disableQueryLog();

    expect($updates)->toHaveCount(1)
        ->and(File::query()->where('parent_id', $folder->id)->where('effective_access', FileAccessEnum::Private->value)->count())->toBe(10);
});

/**
 * Build the state of a 1.3.0 install right after the column migration: every
 * row has NULL effective_access (private folder, inheriting child, private file,
 * public file).
 *
 * @return array{hiddenNames: list<string>, publicName: string}
 */
function seedUpgradedFromOneThreeZeroFiles(): array
{
    $privateFolder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'legacy-vault',
        'path' => '/legacy-vault',
        'disk' => 'assets',
        'access' => FileAccessEnum::Private->value,
    ]);

    $inheritingChild = makeStoredFile('legacy-inside-vault.jpg');
    $inheritingChild->update([
        'parent_id' => $privateFolder->id,
        'access' => null,
        'path' => '/legacy-vault/legacy-inside-vault.jpg',
    ]);

    makeStoredFile('legacy-private.jpg')->update(['access' => FileAccessEnum::Private->value]);
    makeStoredFile('legacy-public.jpg');

    File::query()->update(['effective_access' => null]);

    return [
        'hiddenNames' => ['legacy-inside-vault.jpg', 'legacy-private.jpg'],
        'publicName' => 'legacy-public.jpg',
    ];
}

it('fails closed on NULL effective_access for roles without read_private', function (): void {
    grantPublicFileActions([FilePermissionActionEnum::Read]);
    $dataset = seedUpgradedFromOneThreeZeroFiles();

    $response = $this->getJson('/api/v1/files')->assertOk();

    foreach ([...$dataset['hiddenNames'], $dataset['publicName']] as $hiddenName) {
        $response->assertJsonMissing(['filename' => $hiddenName]);
    }
});

it('computes effective_access for a 1.3.0 dataset in the upgrade migration', function (): void {
    grantPublicFileActions([FilePermissionActionEnum::Read]);
    $dataset = seedUpgradedFromOneThreeZeroFiles();

    $migration = require database_path('migrations/2026_11_02_174600_backfill_effective_access_on_files_table.php');
    $migration->up();

    expect(File::query()->whereNull('effective_access')->count())->toBe(0);

    $response = $this->getJson('/api/v1/files')
        ->assertOk()
        ->assertJsonFragment(['filename' => $dataset['publicName']]);

    foreach ($dataset['hiddenNames'] as $hiddenName) {
        $response->assertJsonMissing(['filename' => $hiddenName]);
    }
});
