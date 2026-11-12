<?php

use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use App\Services\Uploads\ForbiddenUploadExtensionService;
use App\Services\Uploads\MimeTypeValidatorService;
use App\Services\Uploads\UploadAllowlistService;
use Illuminate\Validation\ValidationException;

beforeEach(function (): void {
    // Reset project settings memo between cases.
    app()->forgetInstance(ProjectSettingsService::class);
    app()->forgetInstance(UploadAllowlistService::class);
});

function setUploadPolicy(array $values): void
{
    app(SettingsRepositoryService::class)->setMany(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        $values,
    );
    app()->forgetInstance(ProjectSettingsService::class);
    app()->forgetInstance(UploadAllowlistService::class);
}

it('defaults match config MIME allowlist and reject SVG', function (): void {
    $allowlist = app(UploadAllowlistService::class);

    expect($allowlist->allowSvg())->toBeFalse()
        ->and($allowlist->allowedExtensions())->toBeNull()
        ->and($allowlist->allowedMimes())->toContain('image/png')
        ->and($allowlist->allowedMimes())->not->toContain(UploadAllowlistService::SVG_MIME);

    expect(ForbiddenUploadExtensionService::isForbidden('icon.svg'))->toBeTrue();
    expect(fn () => ForbiddenUploadExtensionService::assertAllowed('icon.svg'))
        ->toThrow(ValidationException::class);
});

it('SVG opt-in allows svg extension and MIME', function (): void {
    setUploadPolicy(['upload_allow_svg' => true]);

    $allowlist = app(UploadAllowlistService::class);
    expect($allowlist->allowSvg())->toBeTrue()
        ->and($allowlist->allowedMimes())->toContain(UploadAllowlistService::SVG_MIME)
        ->and(ForbiddenUploadExtensionService::isForbidden('logo.svg'))->toBeFalse();

    ForbiddenUploadExtensionService::assertAllowed('logo.svg');

    $svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    expect(MimeTypeValidatorService::assertAllowed('logo.svg', $svg))->toBe(UploadAllowlistService::SVG_MIME);
});

it('hard floor still blocks php even when listed in allowlist settings', function (): void {
    setUploadPolicy([
        'upload_allowed_extensions' => ['php', 'png'],
        'upload_allowed_mimes' => ['application/x-httpd-php', 'image/png'],
        'upload_allow_svg' => true,
    ]);

    expect(ForbiddenUploadExtensionService::isHardFloor('shell.php'))->toBeTrue();
    expect(fn () => ForbiddenUploadExtensionService::assertAllowed('shell.php'))
        ->toThrow(ValidationException::class);

    $errors = null;
    try {
        ForbiddenUploadExtensionService::assertAllowed('shell.php');
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
    expect(MimeTypeValidatorService::assertAllowed('pixel.png', $png))->toBe('image/png');

    expect(fn () => MimeTypeValidatorService::assertAllowed('doc.pdf', "%PDF-1.4\n%âãÏÓ\n"))
        ->toThrow(ValidationException::class);
});

it('MIME allowlist override rejects types outside the project list', function (): void {
    setUploadPolicy([
        'upload_allowed_mimes' => ['image/png'],
    ]);

    expect(fn () => MimeTypeValidatorService::assertAllowed('doc.pdf', "%PDF-1.4\n"))
        ->toThrow(ValidationException::class);
});
