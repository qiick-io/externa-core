<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Hand-built lists moved to Item rows: revisions (page checkboxes), the
 * collection fields list (stretched edit button, width radio menu) and the
 * file picker drawer (FileCard tiles).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->collection = Collection::factory()->create(['name' => 'Rows', 'slug' => 'rows', 'versioning' => false]);
});

it('compares the two revisions checked in the list', function (): void {
    $item = CollectionItem::factory()->create(['collection_id' => $this->collection->id]);
    $first = CollectionItemRevision::query()->create(['item_id' => $item->id, 'data' => ['title' => 'Old title'], 'created_at' => now()->subDay()]);
    $second = CollectionItemRevision::query()->create(['item_id' => $item->id, 'data' => ['title' => 'New title'], 'created_at' => now()]);

    visit("/collections/{$this->collection->id}/items/{$item->id}/revisions")
        ->assertAttribute("#revision-select-{$first->id}", 'aria-checked', 'true')
        ->click("#revision-select-{$first->id}")
        ->assertAttribute("#revision-select-{$first->id}", 'aria-checked', 'false')
        ->assertSee('Select two revisions to see field diffs.')
        ->click("label[for=\"revision-select-{$first->id}\"]")
        ->assertAttribute("#revision-select-{$first->id}", 'aria-checked', 'true')
        ->assertSee('"Old title"')
        ->assertSee('"New title"')
        ->assertNoJavaScriptErrors();
});

it('opens a field from its row and sets its width from the menu', function (): void {
    $field = CollectionField::factory()->for($this->collection)->create(['name' => 'headline', 'type' => FieldTypeEnum::String]);

    visit(route('collections.fields.index', $this->collection, false))
        ->click('button[aria-label="Field actions"]')
        ->click('[role="menuitemradio"]:has-text("Half width")')
        ->wait(1)
        ->assertSee('Half width')
        ->click('headline')
        ->wait(0.5)
        ->assertPresent('form input[name="name"]')
        ->assertNoJavaScriptErrors();

    expect($field->fresh()->settings['layout_width'] ?? null)->toBe('half');
});

it('picks library files from FileCard tiles in the picker drawer', function (): void {
    CollectionField::factory()->for($this->collection)->create(['name' => 'attachments', 'type' => FieldTypeEnum::Files]);
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

    visit(route('collections.items.new', $this->collection, false))
        ->click('button[aria-label="Choose from library"]')
        ->click("[data-testid=\"file-card-{$brief->id}\"]")
        ->assertAttribute("[data-testid=\"file-card-{$brief->id}\"]", 'data-selected', 'true')
        ->click('Choose 1')
        ->assertSee('Campaign brief')
        ->assertNoJavaScriptErrors();
});
