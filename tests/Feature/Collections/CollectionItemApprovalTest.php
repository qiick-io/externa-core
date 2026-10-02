<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Webhooks\OutboundWebhookCatalog;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('catalog reserves approval webhook events', function () {
    expect(OutboundWebhookCatalog::has('item.submitted'))->toBeTrue();
    expect(OutboundWebhookCatalog::has('item.approved'))->toBeTrue();
    expect(OutboundWebhookCatalog::has('item.rejected'))->toBeTrue();
});

test('approvals block publish until approved then allow promote', function () {
    Notification::fake();

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => ['title' => 'staging'],
    ])->assertRedirect();

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect()
        ->assertSessionHas('error');

    $item->refresh();
    expect($item->draft_data['title'] ?? null)->toBe('staging');
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('live');

    $this->post(route('collections.items.submit-for-review', [$collection, $item]))
        ->assertRedirect()
        ->assertSessionHas('success');

    $item->refresh();
    expect($item->approval_status)->toBe('in_review');

    $this->post(route('collections.items.approve', [$collection, $item]))
        ->assertRedirect()
        ->assertSessionHas('success');

    $item->refresh();
    expect($item->approval_status)->toBe('approved');

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect()
        ->assertSessionHas('success');

    $item->refresh();
    expect($item->draft_data)->toBeNull();
    expect($item->approval_status)->toBe('draft');
    expect(app(CollectionItemValuesAssembler::class)->assemble($item)['title'])->toBe('staging');
});

test('reviewer can reject with note', function () {
    Notification::fake();

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => ['title' => 'bad'],
    ])->assertRedirect();

    $this->post(route('collections.items.submit-for-review', [$collection, $item]))
        ->assertRedirect();

    $this->post(route('collections.items.reject', [$collection, $item]), [])
        ->assertSessionHasErrors('rejection_note');

    $this->post(route('collections.items.reject', [$collection, $item]), [
        'rejection_note' => 'Needs clearer headline',
    ])->assertRedirect()->assertSessionHas('success');

    $item->refresh();
    expect($item->approval_status)->toBe('rejected');
    expect($item->rejection_note)->toBe('Needs clearer headline');
});

test('submit and approve require dedicated permissions', function () {
    Notification::fake();

    $editor = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($editor);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $item->draft_data = ['title' => 'staging'];
    $item->save();

    $this->post(route('collections.items.submit-for-review', [$collection, $item]))
        ->assertForbidden();

    $submitter = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanSubmitCollections->value,
    ]);
    $this->actingAs($submitter);

    $this->post(route('collections.items.submit-for-review', [$collection, $item]))
        ->assertRedirect();

    $this->post(route('collections.items.approve', [$collection, $item]))
        ->assertForbidden();
});

test('list filter in_review returns awaiting items', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $waiting = $collection->items()->create([
        'approval_status' => 'in_review',
        'draft_data' => ['title' => 'a'],
    ]);
    $collection->items()->create([
        'approval_status' => 'draft',
        'draft_data' => ['title' => 'b'],
    ]);

    $this->get(route('collections.items.index', [
        'collection' => $collection,
        'in_review' => 1,
    ]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('filters.in_review', true)
            ->has('items.data', 1)
            ->where('items.data.0.id', $waiting->id));
});

test('approvals_required requires versioning', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => false,
        'approvals_required' => false,
    ]);

    $this->put(route('collections.update', $collection), [
        'name' => $collection->name,
        'slug' => $collection->slug,
        'approvals_required' => true,
        'versioning' => false,
    ])->assertSessionHasErrors('approvals_required');
});
