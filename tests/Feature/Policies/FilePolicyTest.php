<?php

declare(strict_types=1);

use App\Enums\ApiKeyFilesScopeEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\File;
use App\Models\Role;
use App\Models\User;
use App\Support\Api\ApiAccess;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    Storage::fake('assets');
});

/**
 * Put an API actor on the current request, as ResolveApiAccessMiddleware does.
 */
function actAsFileApiActor(Role $role, ?ApiKey $apiKey = null): void
{
    request()->attributes->set('apiAccess', new ApiAccess(
        actor: $apiKey === null ? 'public' : 'api_key',
        role: $role,
        apiKey: $apiKey,
    ));
}

function filePolicyRole(): Role
{
    return Role::factory()->create(['name' => 'file-policy-'.uniqid()]);
}

it('grants API actors the file actions their role holds', function (): void {
    grantPublicFileActions([FilePermissionActionEnum::Read]);
    actAsFileApiActor(filesPublicRole());
    $file = makeStoredFile();

    expect(Gate::allows('viewAny', File::class))->toBeTrue()
        ->and(Gate::allows('view', $file))->toBeTrue()
        ->and(Gate::allows('create', File::class))->toBeFalse()
        ->and(Gate::allows('update', File::class))->toBeFalse()
        ->and(Gate::allows('delete', File::class))->toBeFalse();
});

it('denies API actors with the Files API message', function (): void {
    actAsFileApiActor(filesPublicRole());

    $response = Gate::inspect('create', File::class);

    expect($response->denied())->toBeTrue()
        ->and($response->message())->toBe('This action is unauthorized for files.');
});

it('requires read_private for an effectively private file', function (): void {
    $role = filePolicyRole();
    grantFileActions($role, [FilePermissionActionEnum::Read]);
    actAsFileApiActor($role);
    $file = makeStoredFile('secret.jpg');
    $file->update(['access' => 'private']);

    expect(Gate::allows('view', $file->fresh()))->toBeFalse();

    grantFileActions($role, [FilePermissionActionEnum::ReadPrivate]);

    expect(Gate::allows('view', $file->fresh()))->toBeTrue();
});

it('narrows the role to the API key files_scope', function (): void {
    $role = filePolicyRole();
    grantFileActions($role, [FilePermissionActionEnum::Read, FilePermissionActionEnum::Create]);
    $apiKey = makeApiKeyForRole($role)['key'];
    $apiKey->update(['files_scope' => ApiKeyFilesScopeEnum::Read]);
    actAsFileApiActor($role, $apiKey->fresh());

    expect(Gate::allows('viewAny', File::class))->toBeTrue()
        ->and(Gate::allows('create', File::class))->toBeFalse();
});

it('caps an owned API key at its owner roles', function (): void {
    $keyRole = filePolicyRole();
    grantFileActions($keyRole, [FilePermissionActionEnum::Read, FilePermissionActionEnum::Delete]);
    $ownerRole = filePolicyRole();
    grantFileActions($ownerRole, [FilePermissionActionEnum::Read]);
    $owner = User::factory()->create(['is_active' => true]);
    $owner->syncRoles([$ownerRole]);
    $apiKey = makeApiKeyForRole($keyRole)['key'];
    $apiKey->update(['owner_id' => $owner->id]);
    actAsFileApiActor($keyRole, $apiKey->fresh());

    expect(Gate::forUser($owner)->allows('viewAny', File::class))->toBeTrue()
        ->and(Gate::forUser($owner)->allows('delete', File::class))->toBeFalse();
});

it('does not let a super-admin owner bypass the API key role', function (): void {
    $owner = User::factory()->create(['is_active' => true]);
    $owner->assignRole(RoleEnum::SuperAdmin->value);
    $apiKey = makeApiKeyForRole(filePolicyRole())['key'];
    $apiKey->update(['owner_id' => $owner->id]);
    actAsFileApiActor($apiKey->role, $apiKey->fresh());

    expect(Gate::forUser($owner)->allows('viewAny', File::class))->toBeFalse();
});

it('keeps session users on their Spatie file permissions', function (): void {
    $user = grantFilePermissions(User::factory()->create(['is_active' => true]), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $file = makeStoredFile('secret.jpg');
    $file->update(['access' => 'private']);
    $gate = Gate::forUser($user);

    expect($gate->allows('viewAny', File::class))->toBeTrue()
        ->and($gate->allows('view', $file->fresh()))->toBeTrue()
        ->and($gate->allows('create', File::class))->toBeFalse()
        ->and($gate->allows('update', File::class))->toBeFalse()
        ->and($gate->allows('delete', File::class))->toBeFalse();
});

it('grants super-admin session users every file ability', function (): void {
    $superAdmin = User::factory()->create(['is_active' => true]);
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $gate = Gate::forUser($superAdmin);

    expect($gate->allows('view', makeStoredFile()))->toBeTrue()
        ->and($gate->allows('create', File::class))->toBeTrue()
        ->and($gate->allows('update', File::class))->toBeTrue()
        ->and($gate->allows('delete', File::class))->toBeTrue();
});

it('denies guests without an API actor', function (): void {
    expect(Gate::forUser(null)->allows('viewAny', File::class))->toBeFalse();
});

it('answers the Files API 403 with the same message through the policy', function (): void {
    $this->getJson('/api/v1/files')
        ->assertForbidden()
        ->assertJsonPath('message', 'This action is unauthorized for files.');

    $this->deleteJson('/api/v1/files/999999')
        ->assertForbidden()
        ->assertJsonPath('message', 'This action is unauthorized for files.');
});
