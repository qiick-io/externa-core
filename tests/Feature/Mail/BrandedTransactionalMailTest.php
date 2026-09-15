<?php

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\User;
use App\Notifications\FileZipReadyNotification;
use App\Services\Settings\SettingsRepository;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;

/**
 * @return array{logo: File, logoUrl: string}
 */
function seedMailBrandingAppearance(string $projectName = 'Externa Brand', string $color = '#c45c26'): array
{
    $repository = app(SettingsRepository::class);
    $repository->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'name' => $projectName,
    ]);

    $logo = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'mail-logo.png',
        'path' => '/mail-logo.png',
        'disk' => 'assets',
        'storage_path' => 'branding/mail-logo.png',
        'mime_type' => 'image/png',
    ]);

    $repository->setMany(SettingsRepository::SCOPE_PROJECT, 'appearance', [
        'project_color' => $color,
        'project_logo' => $logo->id,
    ]);

    $logoUrl = (string) Storage::disk('assets')->url($logo->storage_path);

    return ['logo' => $logo, 'logoUrl' => $logoUrl];
}

test('password reset mail HTML uses project logo color and name', function () {
    $brand = seedMailBrandingAppearance();
    $user = User::factory()->create();

    $html = (new ResetPassword('test-token'))->toMail($user)->render()->toHtml();

    expect($html)
        ->toContain($brand['logoUrl'])
        ->toContain('#c45c26')
        ->toContain('Externa Brand')
        ->not->toContain('laravel.com/img/notification-logo');
});

test('verify email HTML uses project branding without Laravel logo', function () {
    $brand = seedMailBrandingAppearance('Verify Co', '#112233');
    $user = User::factory()->unverified()->create();

    $html = (new VerifyEmail)->toMail($user)->render()->toHtml();

    expect($html)
        ->toContain($brand['logoUrl'])
        ->toContain('#112233')
        ->toContain('Verify Co')
        ->not->toContain('laravel.com/img/notification-logo');
});

test('mail falls back to project name text when logo unset', function () {
    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', [
        'name' => 'Text Only Project',
    ]);
    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'appearance', [
        'project_color' => '#00aa55',
        'project_logo' => null,
    ]);

    $user = User::factory()->create();
    $html = (new ResetPassword('test-token'))->toMail($user)->render()->toHtml();

    expect($html)
        ->toContain('Text Only Project')
        ->toContain('#00aa55')
        ->not->toContain('laravel.com/img/notification-logo')
        ->not->toContain('class="logo"');
});

test('database notifications stay unaffected by mail branding', function () {
    Notification::fake();

    $user = User::factory()->create();
    seedMailBrandingAppearance();

    $notification = new FileZipReadyNotification(
        jobId: 'job-1',
        downloadUrl: 'https://example.test/zip',
        expiresAt: now()->addHour()->toIso8601String(),
        fileCount: 2,
        zipBytes: 100,
    );

    expect($notification->via($user))->not->toContain('mail');

    $user->notify($notification);

    Notification::assertSentTo($user, FileZipReadyNotification::class);
});
