<?php

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\CreateSuperAdminSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

test('demo seeder builds rich cms graph with volume and users', function () {
    config(['ai.embeddings.enabled' => false]);

    $this->seed([
        PermissionSeeder::class,
        RoleSeeder::class,
        CreateSuperAdminSeeder::class,
        DemoSeeder::class,
    ]);

    $articles = Collection::query()->where('slug', 'articles')->first();

    expect($articles)->not->toBeNull()
        ->and($articles->fields()->where('name', 'author')->exists())->toBeTrue()
        ->and($articles->fields()->where('name', 'tags')->exists())->toBeTrue()
        ->and($articles->fields()->where('name', 'modules')->exists())->toBeTrue()
        ->and($articles->fields()->where('name', 'related_articles')->exists())->toBeTrue()
        ->and(Collection::query()->whereIn('slug', [
            'authors', 'tags', 'comments', 'events', 'pages', 'products', 'categories', 'seo',
        ])->count())->toBe(8)
        ->and(CollectionItem::query()->where('collection_id', $articles->id)->count())->toBeGreaterThanOrEqual(80)
        ->and(CollectionItem::query()->whereHas(
            'collection',
            fn ($q) => $q->where('slug', 'comments'),
        )->count())->toBeGreaterThanOrEqual(120)
        ->and(User::query()->where('email', 'like', 'demo.user.%@externa.test')->count())->toBe(48)
        ->and(UserGroup::query()->count())->toBeGreaterThanOrEqual(5);

    // Idempotent second pass keeps counts stable.
    $this->seed(DemoSeeder::class);

    expect(CollectionItem::query()->where('collection_id', $articles->id)->count())->toBe(80)
        ->and(User::query()->where('email', 'like', 'demo.user.%@externa.test')->count())->toBe(48);
});

test('database seeder skips rich demo unless SEED_DEMO_RICH', function () {
    putenv('SEED_DEMO_RICH=0');
    $_ENV['SEED_DEMO_RICH'] = '0';
    $_SERVER['SEED_DEMO_RICH'] = '0';

    $this->seed(DatabaseSeeder::class);

    expect(Collection::query()->where('slug', 'articles')->exists())->toBeFalse()
        ->and(Collection::query()->where('slug', 'authors')->exists())->toBeFalse();
});
