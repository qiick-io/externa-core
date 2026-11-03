<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Control scale (#472): app-header actions, page headers and list toolbars,
 * the item-edit sub-header and schedule bar, settings forms and the activity
 * log filters all use the default control size (32px; icon-only buttons are
 * 32×32). Only compact inline actions such as table row icons use `sm`.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->collection = Collection::factory()->create([
        'name' => 'Scale Posts',
        'slug' => 'scale-posts',
        'is_singleton' => false,
        'versioning' => true,
    ]);
    CollectionField::factory()->for($this->collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $this->item = $this->collection->items()->create([]);

    File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Scale folder',
        'path' => '/Scale folder',
        'disk' => 'assets',
    ]);
});

/**
 * JS returning `[label, width, height, slot]` for every visible control in the
 * given regions. Buttons are matched by element (Radix triggers rename their
 * `data-slot`); checkboxes, switches and table bodies are skipped.
 */
function controlScaleMeasurementScript(string $regionSelector): string
{
    $regionSelectorJson = json_encode($regionSelector);

    return <<<JS
(() => {
  const controlSelector = [
    'button[data-slot]:not([role="checkbox"]):not([role="switch"])',
    'a[data-slot="button"]',
    '[data-slot="input"]:not([type="checkbox"]):not([type="hidden"])',
    '[data-slot="native-select"]',
    '[data-slot="select-trigger"]',
    '[data-slot="toggle-group-item"]',
  ].join(',');
  const controls = [...document.querySelectorAll({$regionSelectorJson})]
    .flatMap((region) => [...region.querySelectorAll(controlSelector)]);

  return [...new Set(controls)]
    .filter((control) => !control.closest('tbody'))
    .filter((control) => { const box = control.getBoundingClientRect(); return box.width > 0 && box.height > 0; })
    .map((control) => {
      const box = control.getBoundingClientRect();
      const label = control.getAttribute('aria-label') || control.getAttribute('placeholder') || control.textContent.trim().slice(0, 30) || control.id;

      return [label, box.width, box.height, control.dataset.slot];
    });
})()
JS;
}

/**
 * Pages and the regions whose controls must all use the default size.
 *
 * @return array<string, array{0: Closure(): string, 1: string}>
 */
function controlScalePages(): array
{
    $headerRegions = 'header, [data-slot="page-header"]';

    return [
        'files' => [fn (): string => '/files', $headerRegions],
        'collections' => [fn (): string => '/collections', $headerRegions],
        'items' => [fn (): string => route('collections.items.index', [test()->collection], false), $headerRegions],
        'item edit' => [
            fn (): string => route('collections.items.show', [test()->collection, test()->item], false),
            $headerRegions.', [data-test="item-schedule-panel"]',
        ],
        'settings profile and notifications' => [fn (): string => '/settings/profile', 'header, #main-content form'],
        'activity log' => [fn (): string => '/activity-logs', $headerRegions],
    ];
}

it('renders every header, toolbar and form control at the default 32px', function (string $pageName) {
    [$url, $regions] = controlScalePages()[$pageName];

    $page = visit($url());

    $page->assertNoJavaScriptErrors();

    $controls = $page->script(controlScaleMeasurementScript($regions));

    expect(count($controls))->toBeGreaterThan(2);

    foreach ($controls as [$label, $width, $height, $slot]) {
        expect($height)->toEqual(32, "{$pageName}: \"{$label}\" ({$slot}) is {$height}px tall");
    }
})->with(array_keys(controlScalePages()));

it('renders icon-only header and toolbar buttons as 32×32 squares', function (string $pageName) {
    [$url, $regions] = controlScalePages()[$pageName];

    $page = visit($url());

    $iconButtons = array_filter(
        $page->script(controlScaleMeasurementScript($regions)),
        fn (array $control): bool => $control[1] <= 40 && $control[3] !== 'input',
    );

    expect($iconButtons)->not->toBeEmpty();

    foreach ($iconButtons as [$label, $width, $height]) {
        expect([$width, $height])->toEqual([32, 32], "{$pageName}: \"{$label}\" is {$width}×{$height}");
    }
})->with(['files', 'items', 'item edit']);

it('gives the settings "Test sound" and "Save" buttons the same height', function () {
    $page = visit('/settings/profile');

    $heights = $page->script(<<<'JS'
['[data-test="notification-sounds-test"]', '[data-test="notification-sounds-save"]']
  .map((selector) => document.querySelector(selector)?.getBoundingClientRect().height ?? null)
JS);

    expect($heights)->toEqual([32, 32]);
});

it('keeps table row actions on the compact 24px size', function () {
    $page = visit('/collections');

    $rowActionHeights = $page->script(
        '[...document.querySelectorAll(\'tbody button[aria-label][data-slot]:not([role="checkbox"])\')].map((button) => button.getBoundingClientRect().height)',
    );

    expect($rowActionHeights)->not->toBeEmpty()
        ->each->toEqual(24);
});
