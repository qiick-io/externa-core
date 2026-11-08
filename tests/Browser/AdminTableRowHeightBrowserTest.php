<?php

use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\PendingToolCall;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

/**
 * Every admin table body row is 41px (8px cell padding + a 24px control
 * line + the 1px border): avatars sit at size sm, row actions at icon-sm /
 * icon-xs, long text is truncated to one line, and text-only rows get the
 * same minimum height.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->admin = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Admin']);
    $this->admin->assignRole(RoleEnum::SuperAdmin->value);

    $members = User::factory()->count(4)->create();
    UserGroup::factory()->count(2)->create()->each(
        fn (UserGroup $group) => $group->users()->attach($members->pluck('id')),
    );

    foreach (['Docs', 'CI'] as $name) {
        $secret = ApiKey::generateSecret();
        ApiKey::query()->create([
            'name' => $name,
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
            'role_id' => Role::query()->first()->id,
        ]);
    }

    foreach (range(1, 3) as $index) {
        activity()
            ->causedBy($this->admin)
            ->event('updated')
            ->withProperties(['attributes' => ['title' => str_repeat('A long changed value ', 12)]])
            ->log("Updated a collection item with a rather long description number {$index} that would wrap");
    }

    foreach (range(1, 2) as $index) {
        DB::table('failed_jobs')->insert([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'App\\Jobs\\DuplicateFilesJob']),
            'exception' => "RuntimeException: Something failed in a long way {$index}\n#0 trace",
            'failed_at' => now(),
        ]);
    }

    PendingToolCall::factory()->count(2)->create(['requested_by' => $this->admin->id]);

    $this->collection = Collection::factory()->create(['name' => 'Posts', 'slug' => 'posts', 'versioning' => false]);
    CollectionItem::factory()->count(2)->create(['collection_id' => $this->collection->id]);

    $this->actingAs($this->admin);
});

it('gives every admin list the same 41px body rows', function (string $url): void {
    $page = visit($url === 'items' ? "/collections/{$this->collection->id}/items" : $url);
    $page->wait(0.5);

    $rows = $page->script(<<<'JS'
(() => [...document.querySelectorAll('main tbody tr')]
    .filter((row) => row.querySelectorAll('td').length > 1)
    .map((row) => {
        // Name the tallest piece of content so a failure points at the culprit.
        let tallest = { height: 0, html: '' };
        row.querySelectorAll('td *').forEach((element) => {
            const height = element.getBoundingClientRect().height;
            if (height > tallest.height) {
                tallest = { height, html: element.outerHTML.slice(0, 160) };
            }
        });
        return { height: Math.round(row.getBoundingClientRect().height), cell: `${Math.round(tallest.height)}px ${tallest.html}` };
    }))()
JS);

    expect($rows)->not->toBeEmpty();

    foreach ($rows as $row) {
        expect($row['height'])->toBeGreaterThanOrEqual(40, "{$url}: {$row['height']}px — {$row['cell']}")
            ->toBeLessThanOrEqual(42, "{$url}: {$row['height']}px — {$row['cell']}");
    }

    $page->assertNoJavaScriptErrors();
})->with([
    'users' => '/users',
    'groups' => '/groups',
    'roles' => '/settings/roles',
    'permissions' => '/settings/permissions',
    'api keys' => '/settings/api-keys',
    'activity log' => '/activity-logs',
    'jobs' => '/settings/jobs',
    'pending tool calls' => '/settings/pending-tool-calls',
    'collections' => '/collections',
    'collection items' => 'items',
    'dashboard' => '/dashboard',
]);
