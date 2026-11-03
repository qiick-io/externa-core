<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
use Spatie\Permission\Models\Role;

function grantBrowserAiAndCollectionPermissions(User $user): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-ai-bulk-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([
        ...allCollectionPermissions(),
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
        PermissionEnum::CanDeleteFiles->value,
    ]);
    $user->syncRoles([$role]);

    return $user;
}

/**
 * Answer the /ai/status probe as if the local provider were reachable.
 */
function fakeBrowserAiOnline(): void
{
    Http::fake([
        '*/models' => Http::response(['data' => [['id' => 'browser-test-model']]]),
    ]);
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('opens the assistant FAB with a seeded row prompt on collections', function () {
    fakeBrowserAiOnline();
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'Newsroom',
        'slug' => 'newsroom',
    ]);

    $expected = "Working on collection «Newsroom» (collection_id={$collection->id}, slug=newsroom).";

    $page = visit('/collections');

    $page->assertSee('Newsroom')
        ->assertPresent('button[aria-label="Ask AI"]')
        ->click('button[aria-label="Ask AI"]')
        ->assertPresent('textarea[aria-label="Message"]')
        ->assertValue('textarea[aria-label="Message"]', $expected)
        ->assertNoJavaScriptErrors();
});

it('seeds bulk Ask AI from multi-selected collections and hides sort chrome', function () {
    fakeBrowserAiOnline();
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $alpha = Collection::factory()->create(['name' => 'Alpha Pack', 'slug' => 'alpha-pack']);
    $beta = Collection::factory()->create(['name' => 'Beta Pack', 'slug' => 'beta-pack']);

    $page = visit('/collections');

    $page->assertSee('Alpha Pack')
        ->assertSee('Beta Pack')
        ->assertPresent('button[aria-label="Sort by"]')
        ->click('[aria-label="Select Alpha Pack"]')
        ->click('[aria-label="Select Beta Pack"]')
        ->assertSee('2 selected')
        ->assertMissing('button[aria-label="Sort by"]')
        ->click('Ask AI')
        ->assertPresent('textarea[aria-label="Message"]')
        ->assertValue(
            'textarea[aria-label="Message"]',
            'Working on 2 collections: '.json_encode([
                ['id' => $alpha->id, 'name' => 'Alpha Pack', 'slug' => 'alpha-pack'],
                ['id' => $beta->id, 'name' => 'Beta Pack', 'slug' => 'beta-pack'],
            ]).".\nHelp me with these selected collections:",
        )
        ->assertNoJavaScriptErrors();
});

it('hides files sort and trash chrome when selecting and shows Ask AI', function () {
    fakeBrowserAiOnline();
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'brief.pdf',
        'title' => 'Campaign brief',
        'path' => '/brief.pdf',
        'disk' => 'assets',
        'storage_path' => '2026/07/brief-ai.pdf',
        'mime_type' => 'application/pdf',
        'extension' => 'pdf',
    ]);

    $page = visit('/files');

    $page->assertSee('Campaign brief')
        ->assertPresent('button[aria-label="Sort by"]')
        ->click("[data-testid=\"file-card-{$file->id}\"]")
        ->assertSee('1 selected')
        ->assertSee('Ask AI')
        ->assertMissing('button[aria-label="Sort by"]')
        ->assertMissing('button[aria-label="Trash"]')
        ->click('Ask AI')
        ->assertPresent('textarea[aria-label="Message"]')
        ->assertValue(
            'textarea[aria-label="Message"]',
            'Working on 1 files: '.json_encode([
                ['id' => $file->id, 'name' => 'brief.pdf'],
            ]).".\nHelp me with these selected files:",
        )
        ->assertNoJavaScriptErrors();
});

it('opens the context attach dialog from the assistant page composer', function () {
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $page = visit('/ai');

    $page->click('main button[aria-label="Attach"]')
        ->assertSee('Attach context')
        ->assertSee('Add collection items, library files, or saved prompts the assistant should use for this message.')
        ->assertNoJavaScriptErrors();
});

it('disables every Ask AI entry point with the FAB offline reason while AI is offline', function () {
    Http::fake([
        '*/models' => Http::response([], 503),
    ]);

    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    Collection::factory()->create(['name' => 'Offline Desk', 'slug' => 'offline-desk']);

    $page = visit('/collections');

    $page->assertSee('Offline Desk')
        ->assertAttribute('button[aria-label="Ask AI"]', 'aria-disabled', 'true')
        ->assertScript("(() => { const button = document.querySelector('button[aria-label=\"Ask AI\"]'); return document.getElementById(button.getAttribute('aria-describedby'))?.textContent === 'AI unavailable — check the AI provider configuration'; })()");

    // Playwright refuses to click aria-disabled targets; dispatch the click directly.
    $page->script("document.querySelector('button[aria-label=\"Ask AI\"]').click()");

    $page->assertMissing('textarea[aria-label="Message"]')
        ->click('[aria-label="Select Offline Desk"]')
        ->assertScript("((buttons) => buttons.length > 0 && buttons.every((button) => button.getAttribute('aria-disabled') === 'true'))(Array.from(document.querySelectorAll('button')).filter((button) => button.textContent.trim() === 'Ask AI'))")
        ->assertNoJavaScriptErrors();
});

it('enables Ask AI once the shared status probe reports AI online', function () {
    fakeBrowserAiOnline();
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    Collection::factory()->create(['name' => 'Online Desk', 'slug' => 'online-desk']);

    $page = visit('/collections');

    $page->assertSee('Online Desk')
        ->assertScript("document.querySelector('button[aria-label=\"Ask AI\"]').getAttribute('aria-disabled') === null")
        ->assertScript("document.querySelector('button[aria-label=\"Ask AI\"]').hasAttribute('aria-describedby') === false")
        ->assertNoJavaScriptErrors();
});
