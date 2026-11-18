<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\PendingToolCall;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Axe rules the default smoke run leaves out (WCAG 2.2 `target-size`, the
 * experimental `label-content-name-mismatch`) plus contrast and scrollable
 * regions, on the admin lists with data, desktop and mobile, light and dark.
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

    foreach (range(1, 3) as $index) {
        activity()->causedBy($this->admin)->event('updated')->log("Updated item {$index}");
    }

    foreach (range(1, 15) as $index) {
        DB::table('failed_jobs')->insert([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'App\\Jobs\\DuplicateFilesJob']),
            'exception' => "RuntimeException: failed {$index}\n#0 trace",
            'failed_at' => now(),
        ]);
    }

    PendingToolCall::factory()->count(15)->create(['requested_by' => $this->admin->id]);

    $this->collection = $collection = Collection::factory()->create(['name' => 'Designers', 'slug' => 'designers', 'versioning' => false]);
    CollectionItem::factory()->count(2)->create(['collection_id' => $collection->id]);

    $this->actingAs($this->admin);
});

/**
 * Loads the axe-core build bundled with pest-plugin-browser. Since plugin v5, axe is only
 * injected inside `assertNoAccessibilityIssues()`, and these tests call `window.axe.run`
 * directly to run four specific rules.
 */
function injectBundledAxe($page): void
{
    if ($page->script('typeof window.axe === "undefined"') === true) {
        $page->script((string) file_get_contents(base_path('vendor/pestphp/pest-plugin-browser/resources/js/axe.min.js')));
    }
}

/**
 * @return list<array{id: string, nodes: list<string>}>
 */
function axeRuleViolations($page): array
{
    $page->wait(0.5);
    injectBundledAxe($page);

    return $page->script(<<<'JS'
(async () => {
    const result = await window.axe.run(document, {
        runOnly: { type: 'rule', values: ['color-contrast', 'target-size', 'label-content-name-mismatch', 'scrollable-region-focusable'] },
    });
    return result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
})()
JS);
}

it('passes the extra axe rules on admin lists', function (string $path, string $device, string $mode): void {
    $page = visit($path === 'items' ? "/collections/{$this->collection->id}/items" : $path);
    $page = $device === 'mobile' ? $page->on()->mobile() : $page->on()->macbookAir();
    $page = $mode === 'dark' ? $page->inDarkMode() : $page->inLightMode();

    $page->assertPresent('#main-content');

    expect(axeRuleViolations($page))->toBe([], "{$path} {$device} {$mode}");
})->with([
    'dashboard' => '/dashboard',
    'users' => '/users',
    'groups' => '/groups',
    'collections' => '/collections',
    'collection items' => 'items',
    'activity log' => '/activity-logs',
    'jobs' => '/settings/jobs',
    'pending tool calls' => '/settings/pending-tool-calls',
])->with(['desktop', 'mobile'])->with(['light', 'dark']);

it('puts a table panel in the tab order only while it scrolls', function (): void {
    $state = <<<'JS'
(() => [...document.querySelectorAll('[data-slot="table-panel-scroll"]')].map((element) => ({
    overflows: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
    tabIndex: element.getAttribute('tabindex'),
})))()
JS;

    $mobile = visit('/settings/jobs')->on()->mobile();
    $mobile->wait(0.5);
    $panels = $mobile->script($state);

    expect($panels)->not->toBeEmpty()
        ->and(collect($panels)->contains('overflows', true))->toBeTrue();

    foreach ($panels as $panel) {
        expect($panel['tabIndex'])->toBe($panel['overflows'] ? '0' : null);
    }

    $desktop = visit('/groups')->on()->macbookAir();
    $desktop->wait(0.5);

    expect($desktop->script($state))->toBe([['overflows' => false, 'tabIndex' => null]]);
});
