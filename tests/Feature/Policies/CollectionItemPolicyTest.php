<?php

declare(strict_types=1);

use App\Data\Api\ApiAccessData;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->posts = makePostsCollection();
    CollectionField::factory()->create([
        'collection_id' => $this->posts->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);
    $this->published = collectionItemPolicyItem($this->posts, 'published');
    $this->draft = collectionItemPolicyItem($this->posts, 'draft');

    $this->filteredRole = Role::factory()->create(['name' => 'item-policy-'.uniqid()]);
    $this->filteredRole->givePermissionTo(PermissionEnum::CanShowCollections->value, PermissionEnum::CanEditCollections->value);
    foreach ([CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Update] as $action) {
        CollectionPermission::query()->create([
            'role_id' => $this->filteredRole->id,
            'collection_id' => $this->posts->id,
            'action' => $action->value,
            'allowed' => true,
            'rules' => [
                'fields' => [],
                'item_filter' => [
                    'logic' => 'and',
                    'rules' => [['field' => 'status', 'operator' => 'equals', 'value' => 'published']],
                ],
            ],
        ]);
    }
    app(CollectionPermissionGuardService::class)->forget($this->filteredRole->id);

    $this->filteredUser = User::factory()->create(['is_active' => true]);
    $this->filteredUser->syncRoles([$this->filteredRole]);
});

function collectionItemPolicyItem(Collection $collection, string $status): CollectionItem
{
    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriterService::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizerService::class)->normalize($collection, ['status' => $status], true),
    );

    return $item;
}

it('lets view and update through inside the item filter', function (): void {
    $gate = Gate::forUser($this->filteredUser);

    expect($gate->allows('view', [$this->published, $this->posts]))->toBeTrue()
        ->and($gate->allows('update', [$this->published, $this->posts]))->toBeTrue()
        ->and($gate->allows('delete', [$this->published, $this->posts]))->toBeTrue();
});

it('hides an item outside the read filter as not found', function (): void {
    $response = Gate::forUser($this->filteredUser)->inspect('view', [$this->draft, $this->posts]);

    expect($response->denied())->toBeTrue()
        ->and($response->status())->toBe(404);
});

it('denies writing an item outside the filter with the enforcer message', function (string $ability): void {
    $response = Gate::forUser($this->filteredUser)->inspect($ability, [$this->draft, $this->posts]);

    expect($response->denied())->toBeTrue()
        ->and($response->status())->toBeNull()
        ->and($response->message())->toBe('This item is outside your permission filter.');
})->with(['update', 'delete']);

it('fails closed for an ACL user without rules on the collection', function (): void {
    $pages = Collection::query()->create(['name' => 'Pages', 'slug' => 'pages', 'is_singleton' => false, 'sort_order' => 2]);
    $page = CollectionItem::factory()->create(['collection_id' => $pages->id]);
    $gate = Gate::forUser($this->filteredUser);

    expect($gate->allows('view', [$page, $pages]))->toBeFalse()
        ->and($gate->inspect('update', [$page, $pages])->message())
        ->toBe('This action is unauthorized for the collection.');
});

it('answers an item of another collection as not found', function (): void {
    $pages = Collection::query()->create(['name' => 'Pages', 'slug' => 'pages', 'is_singleton' => false, 'sort_order' => 2]);

    $gate = Gate::forUser($this->filteredUser);

    expect($gate->inspect('view', [$this->published, $pages])->status())->toBe(404)
        ->and($gate->inspect('update', [$this->published, $pages])->status())->toBe(404);
});

it('grants super-admins and Spatie-only editors every item', function (): void {
    $superAdmin = User::factory()->create(['is_active' => true]);
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $editor = User::factory()->create(['is_active' => true]);
    $editor->givePermissionTo(PermissionEnum::CanShowCollections->value, PermissionEnum::CanEditCollections->value);

    foreach ([$superAdmin, $editor] as $user) {
        expect(Gate::forUser($user)->allows('view', [$this->draft, $this->posts]))->toBeTrue()
            ->and(Gate::forUser($user)->allows('update', [$this->draft, $this->posts]))->toBeTrue();
    }
});

it('applies the API key role filter to items', function (): void {
    request()->attributes->set('apiAccess', new ApiAccessData('api_key', $this->filteredRole, makeApiKeyForRole($this->filteredRole)['key']));
    $gate = Gate::forUser(null);

    expect($gate->allows('view', [$this->published, $this->posts]))->toBeTrue()
        ->and($gate->allows('view', [$this->draft, $this->posts]))->toBeFalse()
        ->and($gate->inspect('update', [$this->draft, $this->posts])->message())
        ->toBe('This item is outside your permission filter.');
});
