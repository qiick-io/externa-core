<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('assets');
    $this->withoutVite();
});

it('rejects exe content uploaded as pdf via file manager', function (): void {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);

    $exeAsPdf = UploadedFile::fake()->createWithContent('payload.pdf', "MZ\x90\x00".str_repeat("\x00", 64));

    $this->actingAs($user)
        ->postJson(route('files.upload'), ['file' => $exeAsPdf])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('file');
});

it('rejects text content uploaded as png via file manager', function (): void {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);

    $textAsPng = UploadedFile::fake()->createWithContent('fake.png', 'just plain text pretending');

    $this->actingAs($user)
        ->postJson(route('files.upload'), ['file' => $textAsPng])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('file');
});

it('accepts a real png upload via file manager', function (): void {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);

    $png = UploadedFile::fake()->image('hero.png', 40, 30);

    $this->actingAs($user)
        ->postJson(route('files.upload'), ['file' => $png])
        ->assertCreated();
});
