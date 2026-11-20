<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * Settings → API keys (#781): issuing, rotating and revoking keys. The plain token leaves the
 * server once, a key never holds more than its creator, and only a session user manages keys.
 */
beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->manager = grantAiPermissions(User::factory()->create(['is_active' => true]), [
        PermissionEnum::CanShowApiKeys->value,
        PermissionEnum::CanManageApiKeys->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->keyRole = Role::factory()->create(['name' => 'website-build']);
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function apiKeyCreationPayload(Role $role, array $overrides = []): array
{
    return [
        'name' => 'Website build',
        'role_id' => $role->id,
        'scopes' => ['collections:write'],
        ...$overrides,
    ];
}

describe('create', function (): void {
    it('issues a key with its highest scope per resource and shows the token once', function (): void {
        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole, [
                'scopes' => ['collections:read', 'collections:write', 'files:read'],
            ]))
            ->assertRedirect(route('api-keys.index'))
            ->assertSessionHas('plain_text_api_key');

        $plainTextKey = (string) session('plain_text_api_key');
        $apiKey = ApiKey::query()->sole();

        expect($apiKey->scopes)->toBe(['collections:write', 'files:read'])
            ->and($plainTextKey)->toMatch(ApiKey::TOKEN_PATTERN)
            ->and($apiKey->key_hash)->toBe(hash('sha256', $plainTextKey))
            ->and($apiKey->created_by)->toBe($this->manager->id)
            ->and($apiKey->owner_id)->toBe($this->manager->id);

        $this->actingAs($this->manager)->get(route('api-keys.index'))->assertOk();
        $this->actingAs($this->manager)->get(route('api-keys.index'))
            ->assertOk()
            ->assertDontSee($plainTextKey);
    });

    it('never writes the plain token to the key row or the activity log', function (): void {
        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole))
            ->assertRedirect(route('api-keys.index'));

        $plainTextKey = (string) session('plain_text_api_key');
        $storedKeyRow = json_encode(DB::table('api_keys')->first());
        $activityRows = json_encode(DB::table('activity_log')->get());

        expect($plainTextKey)->not->toBe('')
            ->and($storedKeyRow)->not->toContain($plainTextKey)
            ->and($activityRows)->not->toContain($plainTextKey)
            ->and($activityRows)->not->toContain(hash('sha256', $plainTextKey))
            ->and(json_encode(ApiKey::query()->sole()->toArray()))->not->toContain('key_hash');
    });

    it('logs the creation in the api-keys log with the name and scopes', function (): void {
        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole))
            ->assertRedirect(route('api-keys.index'));

        $activity = Activity::query()->where('log_name', 'api-keys')->sole();

        expect($activity->event)->toBe('created')
            ->and($activity->causer_id)->toBe($this->manager->id)
            ->and($activity->subject_id)->toBe(ApiKey::query()->sole()->id)
            ->and($activity->properties->get('name'))->toBe('Website build')
            ->and($activity->properties->get('scopes'))->toBe(['collections:write']);
    });

    it('refuses a key without scopes or with a scope outside the vocabulary', function (array $scopes, string $field): void {
        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole, ['scopes' => $scopes]))
            ->assertSessionHasErrors($field);

        expect(ApiKey::query()->count())->toBe(0);
    })->with([
        'no scopes' => [[], 'scopes'],
        'boolean-style flag' => [['read_only'], 'scopes.0'],
        'unknown resource' => [['api-keys:write'], 'scopes.0'],
        'unknown action' => [['collections:admin'], 'scopes.0'],
    ]);

    it('refuses a scope its creator does not hold', function (string $scope): void {
        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole, ['scopes' => [$scope]]))
            ->assertSessionHasErrors([
                'scopes.0' => "You cannot issue a key with the {$scope} scope: you do not hold it yourself.",
            ]);

        expect(ApiKey::query()->count())->toBe(0);
    })->with(['files:write', 'mcp:read', 'mcp:write']);

    it('lets a super-admin issue every scope', function (): void {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole(RoleEnum::SuperAdmin->value);

        $this->actingAs($superAdmin)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole, [
                'scopes' => ['collections:write', 'files:write', 'mcp:write'],
            ]))
            ->assertSessionHasNoErrors();

        expect(ApiKey::query()->sole()->scopes)->toBe(['collections:write', 'files:write', 'mcp:write']);
    });

    it('accepts ipv4 and ipv6 allowlist entries and refuses a malformed cidr', function (): void {
        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole, [
                'ip_allowlist' => ['203.0.113.0/24', '2001:db8::/32', '2001:db8::1'],
            ]))
            ->assertSessionHasNoErrors();

        expect(ApiKey::query()->sole()->ip_allowlist)->toBe(['203.0.113.0/24', '2001:db8::/32', '2001:db8::1']);

        ApiKey::query()->delete();

        $this->actingAs($this->manager)
            ->post(route('api-keys.store'), apiKeyCreationPayload($this->keyRole, [
                'ip_allowlist' => ['203.0.113.0/33'],
            ]))
            ->assertSessionHasErrors('ip_allowlist.0');

        expect(ApiKey::query()->count())->toBe(0);
    });
});

describe('rotate and revoke', function (): void {
    it('rotates a key, shows the new token once and logs it', function (): void {
        $apiKey = makeApiKeyForRole($this->keyRole)['key'];
        $hashBefore = $apiKey->key_hash;

        $this->actingAs($this->manager)
            ->post(route('api-keys.rotate', $apiKey))
            ->assertRedirect(route('api-keys.index'))
            ->assertSessionHas('plain_text_api_key');

        $plainTextKey = (string) session('plain_text_api_key');
        $activity = Activity::query()->where('log_name', 'api-keys')->sole();

        expect($apiKey->fresh()->previous_key_hash)->toBe($hashBefore)
            ->and($apiKey->fresh()->key_hash)->toBe(hash('sha256', $plainTextKey))
            ->and($activity->event)->toBe('rotated')
            ->and($activity->causer_id)->toBe($this->manager->id)
            ->and(json_encode(DB::table('activity_log')->get()))->not->toContain($plainTextKey);
    });

    it('refuses to rotate a revoked key', function (): void {
        $apiKey = makeApiKeyForRole($this->keyRole)['key'];
        $apiKey->forceFill(['revoked_at' => now()])->save();
        $hashBefore = $apiKey->key_hash;

        $this->actingAs($this->manager)->post(route('api-keys.rotate', $apiKey))->assertForbidden();

        expect($apiKey->fresh()->key_hash)->toBe($hashBefore);
    });

    it('refuses rotate and revoke to a user who cannot manage keys', function (): void {
        $viewer = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanShowApiKeys->value]);
        $apiKey = makeApiKeyForRole($this->keyRole)['key'];

        $this->actingAs($viewer)->post(route('api-keys.rotate', $apiKey))->assertForbidden();
        $this->actingAs($viewer)->delete(route('api-keys.destroy', $apiKey))->assertForbidden();

        expect($apiKey->fresh()->previous_key_hash)->toBeNull()
            ->and($apiKey->fresh()->revoked_at)->toBeNull();
    });

    it('revokes a key, keeps the row and logs it once', function (): void {
        $apiKey = makeApiKeyForRole($this->keyRole)['key'];

        $this->actingAs($this->manager)->delete(route('api-keys.destroy', $apiKey))->assertRedirect(route('api-keys.index'));
        $revokedAt = $apiKey->fresh()->revoked_at;
        $this->travel(5)->minutes();
        $this->actingAs($this->manager)->delete(route('api-keys.destroy', $apiKey))->assertRedirect(route('api-keys.index'));

        expect($apiKey->fresh()->revoked_at->equalTo($revokedAt))->toBeTrue()
            ->and(Activity::query()->where('log_name', 'api-keys')->where('event', 'revoked')->count())->toBe(1);
    });
});

describe('a key never manages keys', function (): void {
    it('refuses every key management route to a bearer token', function (string $method, string $routeName): void {
        $auth = makeApiKeyForRole();
        $auth['key']->forceFill(['owner_id' => $this->manager->id])->save();
        $hashBefore = $auth['key']->key_hash;

        $this->withToken($auth['plain'])
            ->json($method, route($routeName, $routeName === 'api-keys.store' ? [] : $auth['key']), apiKeyCreationPayload($this->keyRole, [
                'scopes' => ['collections:write', 'files:write', 'mcp:write'],
            ]))
            ->assertUnauthorized();

        expect(ApiKey::query()->count())->toBe(1)
            ->and($auth['key']->fresh()->key_hash)->toBe($hashBefore)
            ->and($auth['key']->fresh()->revoked_at)->toBeNull();
    })->with([
        'create' => ['POST', 'api-keys.store'],
        'rotate' => ['POST', 'api-keys.rotate'],
        'revoke' => ['DELETE', 'api-keys.destroy'],
    ]);
});
