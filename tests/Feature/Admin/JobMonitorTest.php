<?php

use App\Enums\PermissionEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('users without jobs permission cannot view monitor', function () {
    $user = User::factory()->create();
    $this->actingAs($user);
    $this->get(route('jobs.index'))->assertForbidden();
});

test('authorized users can view jobs monitor and delete failed jobs', function () {
    $user = User::factory()->create();
    $role = Role::query()->firstOrCreate([
        'name' => 'test-jobs-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowJobs->value,
        PermissionEnum::CanManageJobs->value,
    ]);
    $user->syncRoles([$role]);
    $this->actingAs($user);

    $uuid = (string) Str::uuid();
    DB::table('failed_jobs')->insert([
        'uuid' => $uuid,
        'connection' => 'database',
        'queue' => 'default',
        'payload' => json_encode(['displayName' => 'App\\Jobs\\ExampleJob']),
        'exception' => 'RuntimeException: boom',
        'failed_at' => now(),
    ]);

    $this->get(route('jobs.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('admin/jobs/index')->has('failed'));

    $this->delete(route('jobs.destroy', $uuid))->assertRedirect();
    expect(DB::table('failed_jobs')->where('uuid', $uuid)->exists())->toBeFalse();
});
