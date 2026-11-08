<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * On a phone the list filter row wraps (search on its own row, then the other
 * controls) instead of drawing its controls on top of each other.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);

    $this->collection = Collection::factory()->create(['name' => 'Designers', 'slug' => 'designers', 'versioning' => false]);
    CollectionItem::factory()->count(2)->create(['collection_id' => $this->collection->id]);

    $this->actingAs($admin);
});

it('keeps the list toolbar controls apart on a phone', function (string $path): void {
    $page = visit($path === 'items' ? "/collections/{$this->collection->id}/items" : $path)->on()->mobile();
    $page->assertPresent('[data-slot="page-header"]');
    $page->wait(0.5);

    $layout = $page->script(<<<'JS'
(() => {
    const controls = [...document.querySelectorAll('[data-slot="page-header"] :is(button, input, [role="combobox"])')]
        // Outermost controls only: not the buttons inside an input group or a trigger.
        .filter((element) => element.matches('[data-slot="input-group"] input') || !element.parentElement.closest('button, [role="combobox"], [data-slot="input-group"]'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const name = (element) => element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.textContent.trim().slice(0, 30);
    const overlaps = [];

    controls.forEach((first, index) => {
        controls.slice(index + 1).forEach((second) => {
            const width = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
            const height = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);

            if (width > 1 && height > 1) {
                overlaps.push(`${name(first.element)} × ${name(second.element)}`);
            }
        });
    });

    return {
        count: controls.length,
        overlaps,
        offscreen: controls.filter(({ rect }) => rect.right > window.innerWidth + 1 || rect.left < -1).map(({ element }) => name(element)),
    };
})()
JS);

    expect($layout['count'])->toBeGreaterThan(1)
        ->and($layout['overlaps'])->toBe([], "{$path}: overlapping toolbar controls")
        ->and($layout['offscreen'])->toBe([], "{$path}: toolbar controls past the viewport");
})->with([
    'files' => '/files',
    'collections' => '/collections',
    'collection items' => 'items',
    'users' => '/users',
    'groups' => '/groups',
    'activity log' => '/activity-logs',
]);
