<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
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

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('opens the assistant FAB with a seeded row prompt on collections', function () {
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    Collection::factory()->create([
        'name' => 'Newsroom',
        'slug' => 'newsroom',
    ]);

    $page = visit('/collections');

    $page->assertSee('Newsroom')
        ->assertSee('Ask AI')
        ->click('button[aria-label="Ask AI"]')
        ->assertSee('Working on collection «Newsroom»')
        ->assertNoJavaScriptErrors();
});

it('seeds bulk Ask AI from multi-selected collections and hides sort chrome', function () {
    $user = grantBrowserAiAndCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    Collection::factory()->create(['name' => 'Alpha Pack', 'slug' => 'alpha-pack']);
    Collection::factory()->create(['name' => 'Beta Pack', 'slug' => 'beta-pack']);

    $page = visit('/collections');

    $page->assertSee('Alpha Pack')
        ->assertSee('Beta Pack')
        ->assertPresent('button[aria-label="Sort by"]')
        ->click('[aria-label="Select Alpha Pack"]')
        ->click('[aria-label="Select Beta Pack"]')
        ->assertSee('2 selected')
        ->assertMissing('button[aria-label="Sort by"]')
        ->click('Ask AI')
        ->assertSee('Working on 2 collections')
        ->assertSee('alpha-pack')
        ->assertNoJavaScriptErrors();
});

it('hides files sort and trash chrome when selecting and shows Ask AI', function () {
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
        ->assertSee('Working on 1 files')
        ->assertSee('brief.pdf')
        ->assertNoJavaScriptErrors();
});
