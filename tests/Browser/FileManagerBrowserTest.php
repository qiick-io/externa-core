<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Collection;
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
        ->assertMissing('[data-test="focal-point-picker"]')
        ->assertDontSee('Translate X')
        ->assertDontSee('Transforms');

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

    $page->assertSee('Drop files to upload')
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

it('keeps mixed file cards the same size with a square preview and truncates long titles', function () {
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

                // Each card opens with a 1:1 AspectRatio preview, then the name / tags footer.
                const aspectSquare = cards.every((card) => {
                    const preview = card.querySelector('[data-radix-aspect-ratio-wrapper]');
                    if (!preview) {
                        return false;
                    }
                    const rect = preview.getBoundingClientRect();

                    return Math.abs(rect.width - rect.height) <= 2;
                });

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
                const square = first.width > 0 && first.height > first.width;

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

it('keeps every checkbox-selected file and moves them all with one bulk action', function () {
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

    $files = collect(['first-pick.txt', 'second-pick.txt'])->map(
        fn (string $name): File => File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => $name,
            'path' => '/'.$name,
            'disk' => 'assets',
            'storage_path' => '2026/07/'.$name,
            'mime_type' => 'text/plain',
            'extension' => 'txt',
        ]),
    );

    $this->actingAs($user);

    $page = visit('/files');

    $page->assertSee('first-pick.txt')
        ->click('[aria-label="Select first-pick.txt"]')
        ->assertSee('1 selected')
        ->click('[aria-label="Select second-pick.txt"]')
        ->assertSee('2 selected')
        ->assertAttribute('[aria-label="Select first-pick.txt"]', 'aria-checked', 'true')
        ->assertAttribute('[aria-label="Select second-pick.txt"]', 'aria-checked', 'true')
        ->rightClick("[data-testid=\"file-card-{$files[0]->id}\"]")
        ->click('[data-testid="files-context-action-move"]')
        ->assertPresent('[data-testid="folder-picker-dialog"]')
        ->click("[data-testid=\"folder-picker-item-{$destination->id}\"]")
        ->click('[data-testid="folder-picker-confirm"]')
        ->assertMissing('[data-testid="folder-picker-dialog"]')
        ->assertNoJavaScriptErrors();

    foreach ($files as $file) {
        expect($file->fresh()->parent_id)->toBe($destination->id);
    }
});

it('selects every visible file from the selection bar and keeps the actions on the right', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);

    $files = collect(range(1, 3))->map(fn (int $index): File => File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => "bulk-{$index}.txt",
        'title' => "Bulk file {$index}",
        'path' => "/bulk-{$index}.txt",
        'disk' => 'assets',
        'storage_path' => "2026/07/bulk-{$index}.txt",
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]));

    $this->actingAs($user);

    $page = visit('/files');

    $page->click("[data-testid=\"file-card-{$files->first()->id}\"]")
        ->assertSee('1 selected')
        ->assertAttribute('[data-testid="files-select-all"]', 'data-state', 'indeterminate')
        ->assertScript(<<<'JS'
(() => {
  const bar = document.querySelector('[data-testid="files-select-all"]').closest('[data-slot="page-header"]').getBoundingClientRect();
  const download = document.querySelector('[data-testid="files-action-download"]').getBoundingClientRect();

  return bar.right - download.right < 8;
})()
JS)
        ->click('[data-testid="files-select-all"]')
        ->assertSee('3 selected')
        ->assertAttribute('[data-testid="files-select-all"]', 'data-state', 'checked')
        ->click('[data-testid="files-select-all"]')
        ->assertMissing('[data-testid="files-select-all"]')
        ->assertNoJavaScriptErrors();
});

it('keeps the selection actions inline after the selection grows and shrinks', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
        PermissionEnum::CanUseAi->value,
    ]);

    $files = collect(range(1, 2))->map(fn (int $index): File => File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => "inline-{$index}.txt",
        'title' => "Inline file {$index}",
        'path' => "/inline-{$index}.txt",
        'disk' => 'assets',
        'storage_path' => "2026/07/inline-{$index}.txt",
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]));

    $this->actingAs($user);

    $page = visit('/files');

    $page->click("[data-testid=\"file-card-{$files->first()->id}\"]")
        ->assertSee('1 selected')
        ->assertVisible('[data-testid="files-action-download"]')
        ->assertScript(<<<'JS'
(() => {
  const askAi = document.querySelector('[data-testid="ask-ai-toolbar"]').getBoundingClientRect();
  const download = document.querySelector('[data-testid="files-action-download"]').getBoundingClientRect();

  return askAi.right < download.left && download.left - askAi.right < 120;
})()
JS)
        ->click('button[aria-label="Select inline-2.txt"]')
        ->assertSee('2 selected')
        ->assertVisible('[data-testid="files-action-download"]')
        ->assertMissing('[data-testid="files-actions-more"]')
        ->click('button[aria-label="Select inline-2.txt"]')
        ->assertSee('1 selected')
        ->assertVisible('[data-testid="files-action-download"]')
        ->assertMissing('[data-testid="files-actions-more"]')
        ->assertNoJavaScriptErrors();
});

it('empties the trash in the background and refreshes when the job reports back', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanForceDeleteFiles->value,
    ]);

    collect(['old-a.txt', 'old-b.txt'])->each(fn (string $name): bool => File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => $name,
        'title' => $name,
        'path' => "/{$name}",
        'disk' => 'assets',
        'storage_path' => "2026/11/{$name}",
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ])->delete());

    $this->actingAs($user);

    $page = visit('/files?trashed=only');

    $page->assertSee('old-a.txt')
        ->click('[data-testid="files-empty-trash"]')
        ->assertSee('Empty the trash?')
        ->click('[data-test="confirm-destructive"]')
        ->assertSee('Trash emptied')
        ->assertDontSee('old-a.txt')
        ->assertAttribute('[data-testid="files-empty-trash"]', 'disabled', '')
        ->assertNoJavaScriptErrors();

    expect(File::query()->withTrashed()->count())->toBe(0);
});

/**
 * @return Collection<int, File>
 */
function createGridFiles(int $count): Collection
{
    return collect(range(1, $count))->map(fn (int $index): File => File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => sprintf('grid-%03d.txt', $index),
        'title' => sprintf('Grid file %03d', $index),
        'path' => sprintf('/grid-%03d.txt', $index),
        'disk' => 'assets',
        'storage_path' => sprintf('2026/11/grid-%03d.txt', $index),
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]));
}

it('fills a tall window with pages automatically and stops at the end of the list', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [PermissionEnum::CanShowFiles->value]);
    createGridFiles(60);
    $this->actingAs($user);

    $page = visit('/files');
    $page->resize(1440, 3200);

    $page->wait(2)
        ->assertScript("document.querySelectorAll('[data-testid^=\"file-card-\"]:not([data-testid^=\"file-card-title\"])').length === 60")
        ->assertMissing('[data-testid="files-load-more"]')
        ->assertNoJavaScriptErrors();
});

it('loads more files on scroll without fetching everything up front', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [PermissionEnum::CanShowFiles->value]);
    createGridFiles(144);
    $this->actingAs($user);

    // A laptop-sized window from the first paint (the default test window is 1728x1117).
    // wait() resolves the page: calls on the device proxy itself open a new visit each time.
    $page = visit('/files')->on()->macbookAir()->wait(1);

    $page->assertScript("(n => n >= 48 && n <= 96)(document.querySelectorAll('[data-testid^=\"file-card-\"]:not([data-testid^=\"file-card-title\"])').length)")
        ->assertPresent('[data-testid="files-load-more"]');

    // Scroll the grid panel to the bottom, as the wheel would.
    foreach (range(1, 4) as $_) {
        $page->script(<<<'JS'
            (() => {
                let panel = document.querySelector('[data-testid="files-load-more"]')?.parentElement;
                while (panel && !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)) {
                    panel = panel.parentElement;
                }
                if (panel) {
                    panel.scrollTop = panel.scrollHeight;
                }
            })()
            JS);
        $page->wait(1);
    }

    $page->assertScript("document.querySelectorAll('[data-testid^=\"file-card-\"]:not([data-testid^=\"file-card-title\"])').length === 144")
        ->assertMissing('[data-testid="files-load-more"]')
        ->assertNoJavaScriptErrors();
});

it('keeps the loaded pages after a move and keeps loading on scroll', function () {
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
    $files = createGridFiles(144);
    $this->actingAs($user);

    $countCards = "document.querySelectorAll('[data-testid^=\"file-card-\"]:not([data-testid^=\"file-card-title\"])').length";
    $scrollGridToEnd = <<<'JS'
        (() => {
            let panel = document.querySelector('[data-testid="files-load-more"]')?.parentElement;
            while (panel && !/(auto|scroll)/.test(getComputedStyle(panel).overflowY)) {
                panel = panel.parentElement;
            }
            if (panel) {
                panel.scrollTop = panel.scrollHeight;
            }
        })()
        JS;
    $page = visit('/files')->on()->macbookAir()->wait(1);
    // Load a second page first (the window alone may hold only one page of cards).
    $page->script($scrollGridToEnd);
    $page->wait(1);
    $loaded = $page->script($countCards);

    expect($loaded)->toBeGreaterThan(48);

    $page->rightClick("[data-testid=\"file-card-{$files[0]->id}\"]")
        ->click('[data-testid="files-context-action-move"]')
        ->click("[data-testid=\"folder-picker-item-{$destination->id}\"]")
        ->click('[data-testid="folder-picker-confirm"]')
        ->wait(1.5)
        ->assertMissing("[data-testid=\"file-card-{$files[0]->id}\"]")
        ->assertScript("{$countCards} === {$loaded}");

    // Scroll the grid panel to the bottom, as the wheel would.
    foreach (range(1, 4) as $_) {
        $page->script($scrollGridToEnd);
        $page->wait(1);
    }

    // The folder plus the 143 files left in the root.
    $page->assertScript("{$countCards} === 144")
        ->assertMissing('[data-testid="files-load-more"]')
        ->assertNoJavaScriptErrors();
});

it('draws the selected card ring inside the card so the grid edge cannot cut it', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);

    $edge = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'edge.txt',
        'path' => '/edge.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/edge.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
    ]);

    $this->actingAs($user);

    visit('/files')
        ->click("[data-testid=\"file-card-{$edge->id}\"]")
        ->assertAttribute("[data-testid=\"file-card-{$edge->id}\"]", 'aria-pressed', 'true')
        ->assertScript(<<<JS
(() => {
  const card = document.querySelector('[data-testid="file-card-{$edge->id}"]');
  const ring = getComputedStyle(card, '::after').boxShadow;
  return getComputedStyle(card).boxShadow === 'none' && ring.includes('inset') && !ring.startsWith('none');
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('shows the name and tags below the image, not over it', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);

    $photo = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'beach-sunset-with-a-very-long-name.png',
        'path' => '/beach.png',
        'disk' => 'assets',
        'storage_path' => '2026/07/beach.png',
        'mime_type' => 'image/png',
        'extension' => 'png',
        'width' => 1600,
        'height' => 900,
    ]);
    $photo->attachTags(['summer', 'travel', 'family']);

    $this->actingAs($user);

    visit('/files')
        ->assertSeeIn("[data-test=\"file-tags-{$photo->id}\"]", 'summer')
        ->assertSeeIn("[data-test=\"file-tags-{$photo->id}\"]", '+2')
        ->assertScript(<<<JS
(() => {
  const card = document.querySelector('[data-testid="file-card-{$photo->id}"]');
  const image = card.querySelector('[data-radix-aspect-ratio-wrapper]').getBoundingClientRect();
  const title = document.querySelector('[data-testid="file-card-title-{$photo->id}"]').getBoundingClientRect();
  const tags = document.querySelector('[data-test="file-tags-{$photo->id}"]').getBoundingClientRect();
  return title.top >= image.bottom - 0.5 && tags.top >= title.bottom - 0.5 && tags.bottom <= card.getBoundingClientRect().bottom + 0.5;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('sets the image focal point by clicking the preview and saves it', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
        PermissionEnum::CanUpdateFileMetadata->value,
    ]);

    $photo = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'photo.png',
        'path' => '/photo.png',
        'disk' => 'assets',
        'storage_path' => '2026/07/photo.png',
        'mime_type' => 'image/png',
        'extension' => 'png',
        'width' => 1600,
        'height' => 900,
    ]);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Albums',
        'path' => '/Albums',
        'disk' => 'assets',
    ]);

    $this->actingAs($user);

    $page = visit('/files');

    $page->click("[data-testid=\"file-card-{$photo->id}\"]")
        ->click('[data-testid="files-action-details"]')
        ->assertPresent('[data-test="focal-point-picker"]')
        ->assertSeeIn('[data-test="focal-point-readout"]', 'not set')
        ->assertDontSee('Translate X')
        ->assertDontSee('Scale');

    // Click a quarter in from the left and three quarters down the image.
    $page->script(<<<'JS'
(() => {
  const picker = document.querySelector('[data-test="focal-point-picker"]');
  const rect = picker.getBoundingClientRect();
  picker.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    detail: 1,
    clientX: rect.left + rect.width * 0.25,
    clientY: rect.top + rect.height * 0.75,
  }));
})()
JS);

    $page->assertPresent('[data-test="focal-point-marker"]')
        ->assertSeeIn('[data-test="focal-point-readout"]', 'X 25% · Y 75%')
        ->click('Save')
        ->wait(1)
        ->assertNoJavaScriptErrors();

    $photo->refresh();

    expect((float) $photo->focal_point_x)->toEqualWithDelta(0.25, 0.01)
        ->and((float) $photo->focal_point_y)->toEqualWithDelta(0.75, 0.01);

    $page->click("[data-testid=\"file-card-{$folder->id}\"]")
        ->click('[data-testid="files-action-details"]')
        ->assertMissing('[data-test="focal-point-picker"]')
        ->assertDontSee('Focal point')
        ->assertDontSee('Translate X')
        ->assertNoJavaScriptErrors();
});

it('nudges the focal point with the keyboard and resets it to the centre', function () {
    $user = grantBrowserFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
        PermissionEnum::CanUpdateFileMetadata->value,
    ]);

    $photo = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'portrait.jpg',
        'path' => '/portrait.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/portrait.jpg',
        'mime_type' => 'image/jpeg',
        'extension' => 'jpg',
        'width' => 600,
        'height' => 900,
        'focal_point_x' => 0.2,
        'focal_point_y' => 0.2,
    ]);

    $this->actingAs($user);

    visit('/files')
        ->click("[data-testid=\"file-card-{$photo->id}\"]")
        ->click('[data-testid="files-action-details"]')
        ->assertSeeIn('[data-test="focal-point-readout"]', 'X 20% · Y 20%')
        ->keys('[data-test="focal-point-picker"]', ['Shift+ArrowRight', 'ArrowDown'])
        ->assertSeeIn('[data-test="focal-point-readout"]', 'X 30% · Y 21%')
        ->click('Reset to centre')
        ->assertSeeIn('[data-test="focal-point-readout"]', 'X 50% · Y 50%')
        ->assertNoJavaScriptErrors();
});
