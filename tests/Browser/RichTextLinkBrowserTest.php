<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The WYSIWYG link is set from a Popover with a URL input (was window.prompt).
 */
it('sets a link on the selected text from the link popover', function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Pages', 'slug' => 'pages', 'versioning' => false]);
    CollectionField::factory()->for($collection)->create(['name' => 'body', 'type' => FieldTypeEnum::Wysiwyg]);

    $page = visit(route('collections.items.new', $collection, false));
    $page->click('.ProseMirror')
        ->type('.ProseMirror', 'Externa docs')
        ->script("document.execCommand('selectAll')");
    $page->click('button[aria-label="Link"]')
        ->fill('[data-test="wysiwyg-link-url"]', 'https://example.com/docs')
        ->keys('[data-test="wysiwyg-link-url"]', 'Enter')
        ->assertPresent('.ProseMirror a[href="https://example.com/docs"]')
        ->click('[data-test="item-save-split"] button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->sole();

    expect(app(CollectionItemValuesAssemblerService::class)->assemble($item)['body'])
        ->toContain('href="https://example.com/docs"');
});

/**
 * WYSIWYG format buttons are Toggles: pressed mirrors the selection's marks.
 */
it('presses the bold toggle when the selection turns bold', function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Notes', 'slug' => 'notes', 'versioning' => false]);
    CollectionField::factory()->for($collection)->create(['name' => 'body', 'type' => FieldTypeEnum::Wysiwyg]);

    $page = visit(route('collections.items.new', $collection, false));
    $page->click('.ProseMirror')
        ->type('.ProseMirror', 'Loud words')
        ->script("document.execCommand('selectAll')");
    $page->assertAttribute('button[aria-label="Bold"]', 'aria-pressed', 'false')
        ->click('button[aria-label="Bold"]')
        ->assertPresent('.ProseMirror strong')
        ->assertAttribute('button[aria-label="Bold"]', 'aria-pressed', 'true')
        ->assertNoJavaScriptErrors();
});
