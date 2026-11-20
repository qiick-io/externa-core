<?php

declare(strict_types=1);

use App\Models\Setting;
use App\Models\User;
use App\Services\Auth\OidcLegacyImportIssuerService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Qiick\Oidc\Models\UserIdentity;
use Qiick\Oidc\Testing\FakeIdentityProvider;

/*
 * The upgrade of SSO users onto qiick/laravel-oidc (#827): `users.oidc_sub` into `user_identities`
 * through the 2026_11_20 migration, which runs `oidc:import-legacy-subjects`. Runs on every CI
 * database. Also covers the install-upgrade rehearsal path operators take.
 */

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    $this->issuer = 'https://idp.example.com/realms/externa';
    $this->otherIssuer = 'https://other-idp.example.com';
});

function runLegacySubjectMigration(): void
{
    (require database_path('migrations/2026_11_20_000000_import_legacy_oidc_subjects.php'))->up();
    app(ProjectSettingsService::class)->forgetRawCache();
}

/**
 * @return list<array{user_id: int, issuer: string, subject: string}>
 */
function identityRows(): array
{
    return UserIdentity::query()->orderBy('id')->get(['id', 'user_id', 'issuer', 'subject'])
        ->map(fn (UserIdentity $identity): array => [
            'id' => (int) $identity->id,
            'user_id' => (int) $identity->user_id,
            'issuer' => $identity->issuer,
            'subject' => $identity->subject,
        ])->all();
}

/**
 * A legacy 1.5.x-shaped install with SSO configured and every kind of `oidc_sub` the old client could leave.
 *
 * @return array<string, User|null>
 */
function seedLegacySsoInstall(string $issuer, string $otherIssuer): array
{
    app(SettingsRepositoryService::class)->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
        'oidc_enabled' => true,
        'oidc_issuer' => $issuer,
        'oidc_client_id' => 'externa-app',
        'oidc_client_secret' => Crypt::encryptString('fake-client-secret'),
    ]);

    $users = [
        'plain' => User::factory()->create(['oidc_sub' => 'sub-plain']),
        'alreadyLinked' => User::factory()->create(['oidc_sub' => 'sub-already']),
        'conflicting' => User::factory()->create(['oidc_sub' => 'sub-taken']),
        'owner' => User::factory()->create(),
        'otherIssuerSub' => User::factory()->create(['oidc_sub' => 'sub-shared']),
        'otherIssuerOwner' => User::factory()->create(),
        'nullSub' => User::factory()->create(['oidc_sub' => null]),
        'emptySub' => User::factory()->create(['oidc_sub' => '']),
        'neverSso' => User::factory()->create(),
        'upperCase' => User::factory()->create(['oidc_sub' => 'Sub-Case']),
        'lowerCase' => null,
    ];

    // OIDC subjects are case sensitive. MySQL and MariaDB (utf8mb4_unicode_ci) refuse a second
    // `oidc_sub` that differs only by case, so on those engines this legacy row cannot exist.
    try {
        $users['lowerCase'] = User::factory()->create(['oidc_sub' => 'sub-case']);
    } catch (UniqueConstraintViolationException) {
        expect(DB::connection()->getDriverName())->toBeIn(['mysql', 'mariadb']);
    }

    UserIdentity::query()->create(['user_id' => $users['alreadyLinked']->id, 'issuer' => $issuer, 'subject' => 'sub-already']);
    UserIdentity::query()->create(['user_id' => $users['owner']->id, 'issuer' => $issuer, 'subject' => 'sub-taken']);
    UserIdentity::query()->create(['user_id' => $users['otherIssuerOwner']->id, 'issuer' => $otherIssuer, 'subject' => 'sub-shared']);

    return $users;
}

it('reports what it would import without writing', function () {
    $users = seedLegacySsoInstall($this->issuer, $this->otherIssuer);
    $before = identityRows();

    $exitCode = Artisan::call('oidc:import-legacy-subjects', ['--issuer' => $this->issuer, '--dry-run' => true]);
    $expectedImports = $users['lowerCase'] === null ? 3 : 4;

    expect($exitCode)->toBe(1)
        ->and(Artisan::output())
        ->toContain("User {$users['conflicting']->id}: this sub is already linked to user {$users['owner']->id}; skipped.")
        ->toContain("Would import {$expectedImports} identities for issuer {$this->issuer}; 1 already linked, 1 conflicts.")
        ->and(identityRows())->toBe($before);
});

it('imports every legacy SSO user once, relinks nothing and changes nothing on a second run', function () {
    $users = seedLegacySsoInstall($this->issuer, $this->otherIssuer);
    $before = identityRows();

    runLegacySubjectMigration();
    $afterFirstRun = identityRows();

    expect(array_slice($afterFirstRun, 0, count($before)))->toBe($before);

    $imported = array_map(fn (array $row): array => [$row['user_id'], $row['issuer'], $row['subject']], array_slice($afterFirstRun, count($before)));
    $expected = array_values(array_filter([
        [$users['plain']->id, $this->issuer, 'sub-plain'],
        [$users['otherIssuerSub']->id, $this->issuer, 'sub-shared'],
        [$users['upperCase']->id, $this->issuer, 'Sub-Case'],
        $users['lowerCase'] === null ? null : [$users['lowerCase']->id, $this->issuer, 'sub-case'],
    ]));

    expect($imported)->toEqualCanonicalizing($expected)
        ->and(UserIdentity::query()->whereIn('user_id', [$users['nullSub']->id, $users['emptySub']->id, $users['neverSso']->id, $users['conflicting']->id])->exists())->toBeFalse()
        ->and(app(ProjectSettingsService::class)->security()->isOidcAutoLinkEnabled())->toBeTrue()
        ->and(app(OidcLegacyImportIssuerService::class)->issuer())->toBe($this->issuer);

    runLegacySubjectMigration();
    expect(identityRows())->toBe($afterFirstRun);

    expect(Artisan::call('oidc:import-legacy-subjects', ['--issuer' => $this->issuer]))->toBe(1)
        ->and(Artisan::output())->toContain('Imported 0 identities')
        ->and(identityRows())->toBe($afterFirstRun);
});

it('signs every imported SSO user in to the same account through the package', function () {
    $users = seedLegacySsoInstall($this->issuer, $this->otherIssuer);
    runLegacySubjectMigration();
    app(SettingsRepositoryService::class)->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
        'oidc_auto_link' => false,
    ]);
    app(ProjectSettingsService::class)->forgetRawCache();

    $identityProvider = FakeIdentityProvider::fake(issuer: $this->issuer, clientId: 'externa-app');

    $expectedAccounts = array_filter([
        'sub-plain' => $users['plain'],
        'sub-already' => $users['alreadyLinked'],
        'sub-shared' => $users['otherIssuerSub'],
        'Sub-Case' => $users['upperCase'],
        'sub-case' => $users['lowerCase'],
        'sub-taken' => $users['owner'],
    ]);

    foreach ($expectedAccounts as $subject => $user) {
        // Six SSO round-trips exceed the routes' 10/minute throttle.
        $this->travel(1)->minutes();

        $authorizationUrl = (string) $this->get(route('oidc.redirect'))->assertRedirect()->headers->get('Location');
        $this->get($identityProvider->authorize($authorizationUrl, ['sub' => (string) $subject, 'email' => 'nobody@example.com']))
            ->assertRedirect();

        $this->assertAuthenticatedAs($user);
        $this->post(route('logout'));
        $this->assertGuest();
    }
});

it('imports nothing and keeps the auto-link default on an install that never configured SSO', function () {
    User::factory()->create(['oidc_sub' => 'sub-orphan']);

    runLegacySubjectMigration();

    expect(UserIdentity::query()->exists())->toBeFalse()
        ->and(Setting::query()->where('key', 'oidc_auto_link')->exists())->toBeFalse()
        ->and(app(OidcLegacyImportIssuerService::class)->issuer())->toBeNull();
});

it('persists the import issuer only after a successful non-dry artisan run with --issuer', function () {
    User::factory()->create(['oidc_sub' => 'sub-manual']);
    app(SettingsRepositoryService::class)->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
        'oidc_issuer' => 'https://settings-should-not-be-used.example.com',
    ]);

    expect(Artisan::call('oidc:import-legacy-subjects'))->toBe(1)
        ->and(app(OidcLegacyImportIssuerService::class)->issuer())->toBeNull();

    Artisan::call('oidc:import-legacy-subjects', ['--issuer' => $this->issuer, '--dry-run' => true]);
    expect(app(OidcLegacyImportIssuerService::class)->issuer())->toBeNull();

    expect(Artisan::call('oidc:import-legacy-subjects', ['--issuer' => $this->issuer]))->toBe(0)
        ->and(app(OidcLegacyImportIssuerService::class)->issuer())->toBe($this->issuer);

    // A failed re-import under a different issuer must not retarget the bridge.
    User::factory()->create(['oidc_sub' => 'sub-taken']);
    UserIdentity::query()->create([
        'user_id' => User::factory()->create()->id,
        'issuer' => 'https://new-idp.example.com',
        'subject' => 'sub-taken',
    ]);

    expect(Artisan::call('oidc:import-legacy-subjects', ['--issuer' => 'https://new-idp.example.com']))->toBe(1)
        ->and(app(OidcLegacyImportIssuerService::class)->issuer())->toBe($this->issuer);
});

it('keeps an auto-link choice that is already saved', function () {
    app(SettingsRepositoryService::class)->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
        'oidc_issuer' => $this->issuer,
        'oidc_auto_link' => false,
    ]);

    runLegacySubjectMigration();

    expect(app(ProjectSettingsService::class)->security()->isOidcAutoLinkEnabled())->toBeFalse();
});
