<?php

use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use App\Support\Uploads\ForbiddenUploadExtension;
use App\Support\Uploads\MimeTypeValidator;
use App\Support\Uploads\UploadAllowlist;
use Illuminate\Validation\ValidationException;

beforeEach(function (): void {
    // Reset project settings memo between cases.
    app()->forgetInstance(ProjectSettingsService::class);
    app()->forgetInstance(UploadAllowlist::class);
});

function setUploadPolicy(array $values): void
{
    app(SettingsRepositoryService::class)->setMany(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        $values,
    );
    app()->forgetInstance(ProjectSettingsService::class);
    app()->forgetInstance(UploadAllowlist::class);
}

it('defaults match config MIME allowlist and reject SVG', function (): void {
    $allowlist = app(UploadAllowlist::class);

    expect($allowlist->allowSvg())->toBeFalse()
        ->and($allowlist->allowedExtensions())->toBeNull()
        ->and($allowlist->allowedMimes())->toContain('image/png')
        ->and($allowlist->allowedMimes())->not->toContain(UploadAllowlist::SVG_MIME);

    expect(ForbiddenUploadExtension::isForbidden('icon.svg'))->toBeTrue();
    expect(fn () => ForbiddenUploadExtension::assertAllowed('icon.svg'))
        ->toThrow(ValidationException::class);
});

it('SVG opt-in allows svg extension and MIME', function (): void {
    setUploadPolicy(['upload_allow_svg' => true]);

    $allowlist = app(UploadAllowlist::class);
    expect($allowlist->allowSvg())->toBeTrue()
        ->and($allowlist->allowedMimes())->toContain(UploadAllowlist::SVG_MIME)
        ->and(ForbiddenUploadExtension::isForbidden('logo.svg'))->toBeFalse();

    ForbiddenUploadExtension::assertAllowed('logo.svg');

    $svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    expect(MimeTypeValidator::assertAllowed('logo.svg', $svg))->toBe(UploadAllowlist::SVG_MIME);
});

it('hard floor still blocks php even when listed in allowlist settings', function (): void {
    setUploadPolicy([
        'upload_allowed_extensions' => ['php', 'png'],
        'upload_allowed_mimes' => ['application/x-httpd-php', 'image/png'],
        'upload_allow_svg' => true,
    ]);

    expect(ForbiddenUploadExtension::isHardFloor('shell.php'))->toBeTrue();
    expect(fn () => ForbiddenUploadExtension::assertAllowed('shell.php'))
        ->toThrow(ValidationException::class);

    $errors = null;
    try {
        ForbiddenUploadExtension::assertAllowed('shell.php');
    } catch (ValidationException $e) {
        $errors = $e->errors()['file'][0] ?? null;
    }
    expect($errors)->toContain('security floor');
});

it('extension allowlist rejects unlisted safe types', function (): void {
    setUploadPolicy([
        'upload_allowed_extensions' => ['png'],
        'upload_allowed_mimes' => ['image/png', 'application/pdf'],
    ]);

    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    expect(MimeTypeValidator::assertAllowed('pixel.png', $png))->toBe('image/png');

    expect(fn () => MimeTypeValidator::assertAllowed('doc.pdf', "%PDF-1.4\n%âãÏÓ\n"))
        ->toThrow(ValidationException::class);
});

it('MIME allowlist override rejects types outside the project list', function (): void {
    setUploadPolicy([
        'upload_allowed_mimes' => ['image/png'],
    ]);

    expect(fn () => MimeTypeValidator::assertAllowed('doc.pdf', "%PDF-1.4\n"))
        ->toThrow(ValidationException::class);
});
