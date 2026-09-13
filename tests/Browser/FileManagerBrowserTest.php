<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;

function grantBrowserFilePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-file-manager-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('supports drive-like selection, details panel, and folder open', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
        PermissionEnum::CanDeleteFiles->value,
        PermissionEnum::CanDownloadFiles->value,
        PermissionEnum::CanFavoriteFiles->value,
        PermissionEnum::CanCopyFiles->value,
        PermissionEnum::CanReplaceFiles->value,
        PermissionEnum::CanTagFiles->value,
        PermissionEnum::CanUpdateFileMetadata->value,
    ]);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Projects',
        'path' => '/Projects',
        'disk' => 'assets',
    ]);

    $brief = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'brief.txt',
        'title' => 'Campaign brief',
        'path' => '/brief.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/brief.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]);

    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'notes.txt',
        'path' => '/notes.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/notes.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
        'parent_id' => $folder->id,
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('Files')
        ->assertSee('Campaign brief')
        ->assertSee('Projects')
        ->assertNoJavaScriptErrors();

    $page->click("[data-testid=\"file-card-{$brief->id}\"]")
        ->assertSee('1 selected')
        ->assertPresent('[data-testid="files-action-details"]')
        ->assertPresent('[data-testid="files-action-download"]')
        ->click('[data-testid="files-action-details"]')
        ->assertSee('Replace file')
        ->assertSee('Download name')
        ->assertSee('Focal point')
        ->assertSee('Translate X')
        ->assertSee('Scale');

    $page->click("[data-testid=\"file-card-title-{$folder->id}\"]")
        ->assertPathIs('/files/'.$folder->id)
        ->assertQueryStringMissing('parent_id')
        ->assertSee('notes.txt')
        ->assertNoJavaScriptErrors();
});

it('hides download action without download permission', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'locked.txt',
        'path' => '/locked.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/locked.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('locked.txt')
        ->click("[data-testid=\"file-card-{$file->id}\"]")
        ->assertSee('1 selected')
        ->assertMissing('[data-testid="files-action-download"]')
        ->assertNoJavaScriptErrors();
});

it('shows create and upload actions on empty grid area context menu', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('Drop files anywhere to upload')
        ->rightClick('[data-testid="files-grid-area"]')
        ->assertPresent('[data-testid="files-empty-area-context-menu"]')
        ->assertSee('New Folder')
        ->assertSee('Upload File')
        ->assertSee('Upload Folder')
        ->assertNoJavaScriptErrors();
});

it('hides empty grid area context menu without create permission', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('This folder is empty')
        ->rightClick('[data-testid="files-grid-area"]')
        ->assertMissing('[data-testid="files-empty-area-context-menu"]')
        ->assertDontSee('New Folder')
        ->assertNoJavaScriptErrors();
});

it('duplicates a folder asynchronously and refreshes the grid when the job completes', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
    ]);

    Storage::fake('assets');
    Storage::disk('assets')->put('2026/07/async-dup-inside.txt', 'inside');

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Async Dup Source',
        'path' => '/Async Dup Source',
        'disk' => 'assets',
    ]);

    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'inside.txt',
        'path' => '/Async Dup Source/inside.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/async-dup-inside.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
        'parent_id' => $folder->id,
        'size' => 6,
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('Async Dup Source')
        ->rightClick("[data-testid=\"file-card-{$folder->id}\"]")
        ->click('[data-testid="files-context-action-duplicate"]');

    // phpunit.xml QUEUE_CONNECTION=sync — job finishes in the copy POST.
    // Assert DB + hard navigate; do not wait on toast or 2.5s notification poll.
    $copy = null;
    $deadline = microtime(true) + 10;

    while ($copy === null && microtime(true) < $deadline) {
        $copy = File::query()->where('name', 'Async Dup Source copy')->first();

        if ($copy === null) {
            usleep(100_000);
        }
    }

    expect($copy)->not->toBeNull();
    expect($user->fresh()->notifications()->count())->toBeGreaterThan(0);

    $page->navigate('/files')
        ->assertSee('Async Dup Source copy')
        ->assertPresent('[data-testid="file-card-'.$copy->id.'"]')
        ->assertNoJavaScriptErrors();
});

it('keeps mixed file cards square and truncates long titles', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Layout Folder',
        'path' => '/Layout Folder',
        'disk' => 'assets',
    ]);

    $longPdf = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'screencapture-admin-klover-it-admin-files-07676c26-dee6-46fd-bec3-4fb79bf7a533-2026-07-18-15_27_17.pdf',
        'path' => '/screencapture-admin-klover-it-admin-files-07676c26-dee6-46fd-bec3-4fb79bf7a533-2026-07-18-15_27_17.pdf',
        'disk' => 'assets',
        'storage_path' => '2026/07/layout-long.pdf',
        'mime_type' => 'application/pdf',
        'extension' => 'pdf',
    ]);

    // ponytail: plain text (not image) so layout check never hits thumbnail 404.
    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'notes.txt',
        'path' => '/notes.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/layout-notes.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('Layout Folder')
        ->assertSee('notes.txt')
        ->assertScript(<<<JS
            () => {
                const cards = [...document.querySelectorAll('[data-file-id]')];
                if (cards.length < 3) {
                    return false;
                }

                const aspectSquare = cards.every((card) => card.classList.contains('aspect-square'));

                const sizes = cards.map((card) => {
                    const rect = card.getBoundingClientRect();

                    return {
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    };
                });

                const first = sizes[0];
                const within = (a, b, tol = 2) => Math.abs(a - b) <= tol;
                const uniform = sizes.every(
                    (size) => within(size.width, first.width) && within(size.height, first.height),
                );
                const square = within(first.width, first.height) && first.width > 0;

                const pdfTitle = document.querySelector(
                    '[data-testid="file-card-title-{$longPdf->id}"]',
                );
                const truncated = Boolean(
                    pdfTitle
                    && pdfTitle.classList.contains('truncate')
                    && pdfTitle.classList.contains('min-w-0')
                    && pdfTitle.classList.contains('w-full'),
                );

                return aspectSquare && uniform && square && truncated
                    && document.querySelector('[data-testid="file-card-{$folder->id}"]') !== null;
            }
        JS)
        ->assertNoJavaScriptErrors();
});

it('clears selection when using the toolbar clear control', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'clear-me.txt',
        'path' => '/clear-me.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/clear-me.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('clear-me.txt')
        ->click("[data-testid=\"file-card-{$file->id}\"]")
        ->assertSee('1 selected')
        ->assertPresent('[data-testid="files-clear-selection"]')
        ->click('[data-testid="files-clear-selection"]')
        ->assertDontSee('1 selected')
        ->assertNoJavaScriptErrors();
});

it('opens a folder picker dialog for move instead of a prompt', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);

    $destination = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Archive',
        'path' => '/Archive',
        'disk' => 'assets',
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'report.txt',
        'path' => '/report.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/report.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('report.txt')
        ->click("[data-testid=\"file-card-{$file->id}\"]")
        ->assertSee('1 selected')
        ->rightClick("[data-testid=\"file-card-{$file->id}\"]")
        ->click('[data-testid="files-context-action-move"]')
        ->assertPresent('[data-testid="folder-picker-dialog"]')
        ->assertSee('Archive')
        ->click("[data-testid=\"folder-picker-item-{$destination->id}\"]")
        ->assertSee('Destination:')
        ->assertSee('Archive')
        ->click('[data-testid="folder-picker-confirm"]')
        ->assertMissing('[data-testid="folder-picker-dialog"]')
        ->assertNoJavaScriptErrors();

    expect($file->fresh()->parent_id)->toBe($destination->id);
});
