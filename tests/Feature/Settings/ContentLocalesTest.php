<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Support\Collections\CollectionLocaleResolver;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return list<array<string, mixed>>
 */
function contentLocalesSamplePresets(): array
{
    return [
        [
            'key' => 'thumbnail',
            'fit' => 'contain',
            'width' => 128,
            'height' => 128,
            'quality' => 82,
            'without_enlargement' => true,
            'format' => 'auto',
        ],
    ];
}

function grantContentLocaleSettingsUser(): User
{
    $user = User::factory()->create();
    $role = Role::query()->firstOrCreate([
        'name' => 'test-content-locales-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanManageProjectSettings->value]);
    $user->syncRoles([$role]);

    return $user;
}

test('project settings reject empty content locales', function () {
    $user = grantContentLocaleSettingsUser();

    $this->actingAs($user)
        ->put(route('project.update'), [
            'default_language' => 'en',
            'content_locales' => [],
            'default_content_locale' => 'en',
            'password_policy' => 'weak',
            'login_max_attempts' => 5,
            'registration_enabled' => true,
            'email_verification_required' => false,
            'sidebar_modules' => config('settings.project.defaults.sidebar_modules'),
            'preset_transformations' => contentLocalesSamplePresets(),
        ])
        ->assertSessionHasErrors('content_locales');
});

test('project settings require default content locale to be selected', function () {
    $user = grantContentLocaleSettingsUser();

    $this->actingAs($user)
        ->put(route('project.update'), [
            'default_language' => 'en',
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'de-DE',
            'password_policy' => 'weak',
            'login_max_attempts' => 5,
            'registration_enabled' => true,
            'email_verification_required' => false,
            'sidebar_modules' => config('settings.project.defaults.sidebar_modules'),
            'preset_transformations' => contentLocalesSamplePresets(),
        ])
        ->assertSessionHasErrors('default_content_locale');
});

test('project settings persist content locales and resolver reads them', function () {
    $user = grantContentLocaleSettingsUser();

    $this->actingAs($user)
        ->put(route('project.update'), [
            'default_language' => 'en',
            'content_locales' => ['it', 'en', 'de-DE'],
            'default_content_locale' => 'it',
            'fallback_content_locales' => ['it', 'en'],
            'password_policy' => 'weak',
            'login_max_attempts' => 5,
            'registration_enabled' => true,
            'email_verification_required' => false,
            'sidebar_modules' => config('settings.project.defaults.sidebar_modules'),
            'preset_transformations' => contentLocalesSamplePresets(),
        ])
        ->assertSessionHasNoErrors();

    $settings = app(ProjectSettings::class);
    expect($settings->contentLocales())->toBe(['it', 'en', 'de-DE'])
        ->and($settings->defaultContentLocale())->toBe('it')
        ->and($settings->fallbackContentLocales())->toBe(['it', 'en']);

    $request = Request::create('/test', 'GET');
    $request->headers->remove('Accept-Language');
    $resolver = new CollectionLocaleResolver($request, $settings);
    expect($resolver->allowedLocales())->toBe(['it', 'en', 'de-DE'])
        ->and($resolver->resolve())->toBe('it')
        ->and($resolver->isAllowed('de-DE'))->toBeTrue()
        ->and($resolver->isAllowed('fr-FR'))->toBeFalse();
});

test('item validation rejects unknown translation locale keys', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    app(SettingsRepository::class)->setMany(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        [
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'en',
            'fallback_content_locales' => ['en', 'it'],
        ],
    );

    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'articles-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);

    CollectionField::query()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
        'sort_order' => 1,
        'settings' => [],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'title' => [
                'en' => 'Hello',
                'fr' => 'Bonjour',
            ],
        ],
    ])->assertSessionHasErrors();
});

test('api rejects disabled locale query parameter', function () {
    app(SettingsRepository::class)->setMany(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        [
            'content_locales' => ['en', 'it'],
            'default_content_locale' => 'en',
            'fallback_content_locales' => ['en', 'it'],
        ],
    );

    $collection = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'posts-locale-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);

    $field = CollectionField::query()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
        'sort_order' => 1,
        'settings' => [],
    ]);

    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $item->fieldValues()->create([
        'field_id' => $field->id,
        'locale' => 'en',
        'position' => 0,
        'value' => 'Hello',
    ]);

    // Use admin item resource path via collections show — public API needs grants.
    // Hit CollectionItemResource through public CMS with public read.
    $this->seed(\Database\Seeders\RoleSeeder::class);

    $public = \App\Models\Role::query()
        ->where('name', \App\Enums\RoleEnum::Public->value)
        ->firstOrFail();

    \App\Models\CollectionPermission::query()->updateOrCreate(
        [
            'role_id' => $public->id,
            'collection_id' => $collection->id,
            'action' => \App\Enums\CollectionPermissionAction::Read->value,
        ],
        ['allowed' => true],
    );

    $this->getJson("/api/v1/collections/{$collection->slug}/items/{$item->id}?locale=xx")
        ->assertStatus(422);
});

test('disabling a locale keeps orphan translations in the database', function () {
    $repository = app(SettingsRepository::class);
    $repository->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'content_locales' => ['en', 'it'],
        'default_content_locale' => 'en',
        'fallback_content_locales' => ['en', 'it'],
    ]);

    $collection = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);

    $field = CollectionField::query()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => true,
        'sort_order' => 1,
        'settings' => [],
    ]);

    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $item->fieldValues()->create([
        'field_id' => $field->id,
        'locale' => 'it',
        'position' => 0,
        'value' => 'Ciao',
    ]);

    $repository->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'content_locales' => ['en'],
        'default_content_locale' => 'en',
        'fallback_content_locales' => ['en'],
    ]);

    expect($item->fieldValues()->where('locale', 'it')->exists())->toBeTrue();

    $accessor = app(\App\Support\Collections\CollectionItemDataAccessor::class);
    $all = $accessor->flattenForLocale($item->fresh(), 'en', true);
    expect($all['title'] ?? null)->not->toHaveKey('it');
});
