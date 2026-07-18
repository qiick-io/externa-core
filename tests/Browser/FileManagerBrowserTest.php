<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
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

    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'brief.pdf',
        'title' => 'Campaign brief',
        'path' => '/brief.pdf',
        'disk' => 'assets',
        'storage_path' => '2026/07/brief.pdf',
        'mime_type' => 'application/pdf',
        'extension' => 'pdf',
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

    $page->click('Campaign brief')
        ->assertSee('1 selected')
        ->assertSee('Details')
        ->assertSee('Download')
        ->click('Details')
        ->assertSee('Replace file')
        ->assertSee('Download name')
        ->assertSee('Focal point')
        ->assertSee('Translate X')
        ->assertSee('Scale');

    $page->click('Projects')
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
        ->assertDontSee('Download')
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
        PermissionEnum::CanDownloadFiles->value,
    ]);

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
        'size' => 1,
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('Async Dup Source')
        ->click("[data-testid=\"file-card-{$folder->id}\"]")
        ->assertSee('1 selected')
        ->click('Duplicate')
        ->waitForText("Duplication started — you'll be notified when it finishes")
        ->waitForText('Async Dup Source copy')
        ->assertSee('Async Dup Source copy')
        ->assertNoJavaScriptErrors();

    expect(File::query()->where('name', 'Async Dup Source copy')->exists())->toBeTrue();
    expect($user->fresh()->notifications()->count())->toBeGreaterThan(0);
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

    $image = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'cover.webp',
        'path' => '/cover.webp',
        'disk' => 'assets',
        'storage_path' => '2026/07/cover.webp',
        'mime_type' => 'image/webp',
        'extension' => 'webp',
        'width' => 1200,
        'height' => 800,
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('Layout Folder')
        ->assertSee('cover.webp')
        ->assertScript(<<<JS
            () => {
                const cards = [...document.querySelectorAll('[data-testid^="file-card-"]')];
                if (cards.length < 3) {
                    return false;
                }

                const sizes = cards.map((card) => {
                    const rect = card.getBoundingClientRect();

                    return {
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    };
                });

                const first = sizes[0];
                const uniform = sizes.every(
                    (size) => size.width === first.width && size.height === first.height,
                );
                const square = first.width === first.height && first.width > 0;

                const pdfTitle = document.querySelector(
                    '[data-testid="file-card-{$longPdf->id}"] button.truncate, [data-testid="file-card-{$longPdf->id}"] button[class*="truncate"]',
                );
                const truncated = Boolean(
                    pdfTitle
                    && pdfTitle.scrollWidth > pdfTitle.clientWidth + 1
                    && getComputedStyle(pdfTitle).textOverflow === 'ellipsis',
                );

                const coverImg = document.querySelector(
                    '[data-testid="file-card-{$image->id}"] img',
                );
                const coverAbsolute = Boolean(
                    coverImg && getComputedStyle(coverImg).position === 'absolute',
                );

                return uniform && square && truncated && coverAbsolute
                    && document.querySelector('[data-testid="file-card-{$folder->id}"]') !== null;
            }
        JS)
        ->assertNoJavaScriptErrors();
});

it('clears selection and closes details when clicking empty grid space', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
        PermissionEnum::CanUpdateFileMetadata->value,
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
        ->click('Details')
        ->assertSee('Download name')
        ->assertScript(<<<'JS'
            () => {
                const area = document.querySelector('[data-testid="files-grid-area"]');
                if (!area) {
                    return false;
                }

                area.dispatchEvent(new MouseEvent('click', { bubbles: true }));

                return true;
            }
        JS)
        ->assertDontSee('1 selected')
        ->assertDontSee('Download name')
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
        ->click('button[aria-label="More actions"]')
        ->click('[role="menuitem"]:has-text("Move")')
        ->waitForText('Move to folder')
        ->assertPresent('[data-testid="folder-picker-dialog"]')
        ->waitForText('Archive')
        ->click("[data-testid=\"folder-picker-item-{$destination->id}\"]")
        ->assertSee('Destination:')
        ->assertSee('Archive')
        ->click('[data-testid="folder-picker-confirm"]')
        ->assertMissing('[data-testid="folder-picker-dialog"]')
        ->assertNoJavaScriptErrors();

    expect($file->fresh()->parent_id)->toBe($destination->id);
});
