<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

/**
 * Activity Log filter bar layout and header export menu (#466).
 */
beforeEach(function () {
    $this->seed(PermissionSeeder::class);

    $user = User::factory()->create();
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-activity-log-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowActivityLogs->value]);
    $user->syncRoles([$role]);

    activity()->causedBy($user)->event('created')->log('Filter layout activity');

    $this->actingAs($user);
});

/**
 * Returns the pairs of filter controls whose bounding boxes intersect.
 * An empty array means no control overlaps another.
 */
const ACTIVITY_LOG_OVERLAPPING_FILTERS_SCRIPT = <<<'JS'
    (() => {
        const container = document.querySelector('[data-testid="activity-log-filters"]');
        if (!container) {
            return ['missing filter container'];
        }
        const boxes = Array.from(container.children).map((element) => element.getBoundingClientRect());
        const overlaps = [];
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].width === 0 || boxes[i].height === 0) {
                overlaps.push(`control ${i} not rendered`);
            }
            for (let j = i + 1; j < boxes.length; j++) {
                const first = boxes[i];
                const second = boxes[j];
                const isIntersecting = first.left < second.right - 0.5
                    && second.left < first.right - 0.5
                    && first.top < second.bottom - 0.5
                    && second.top < first.bottom - 0.5;
                if (isIntersecting) {
                    overlaps.push(`${i}x${j}`);
                }
            }
        }
        if (container.scrollWidth > container.clientWidth + 1) {
            overlaps.push('container overflows horizontally');
        }
        return overlaps;
    })()
    JS;

it('lays out the filter controls without overlap at desktop and mobile widths', function (int $width, int $height) {
    $page = visit('/activity-logs');

    $page->resize($width, $height)
        ->wait(0.5)
        ->assertSee('Filter layout activity')
        ->assertVisible('[aria-label="Filter by action"]')
        ->assertVisible('[aria-label="Filter by log name"]')
        ->assertNoJavaScriptErrors();

    expect($page->script(ACTIVITY_LOG_OVERLAPPING_FILTERS_SCRIPT))->toBe([]);
})->with([
    'desktop 1024px' => [1024, 800],
    'mobile 375px' => [375, 812],
]);

it('filters action and log name with faceted Popover + Command filters', function () {
    $page = visit('/activity-logs');

    $page->assertNoJavaScriptErrors()
        ->assertSeeIn('[aria-label="Filter by action"]', 'Action')
        ->assertSeeIn('[aria-label="Filter by log name"]', 'Log name')
        ->assertScript('document.querySelectorAll(\'[data-testid="activity-log-filters"] select:not([aria-hidden="true"])\').length', 0)
        ->click('[aria-label="Filter by log name"]')
        ->click('[role="option"]:has-text("Authentication")')
        ->wait(1)
        ->assertQueryStringHas('log_name', 'auth')
        ->assertSeeIn('[aria-label="Filter by log name"]', 'Authentication')
        ->assertNoJavaScriptErrors();
});

it('offers JSON and CSV export from the header dropdown with the current filters', function () {
    $page = visit('/activity-logs?log_name=auth');

    $page->assertNoJavaScriptErrors()
        ->click('Export')
        ->assertSee('Export JSON')
        ->assertSee('Export CSV')
        ->assertAttributeContains('a[href*="format=json"]', 'href', 'log_name=auth')
        ->assertAttributeContains('a[href*="format=csv"]', 'href', 'log_name=auth')
        ->assertNoJavaScriptErrors();
});
