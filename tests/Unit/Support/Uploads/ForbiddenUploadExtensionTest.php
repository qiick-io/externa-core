<?php

use App\Services\Uploads\ForbiddenUploadExtensionService;
use Illuminate\Validation\ValidationException;

it('allows safe extensions', function (string $fileName): void {
    expect(ForbiddenUploadExtensionService::isForbidden($fileName))->toBeFalse();
    ForbiddenUploadExtensionService::assertAllowed($fileName);
})->with([
    'photo.png',
    'doc.pdf',
    'archive.tar.gz',
    'readme',
]);

it('denies forbidden extensions', function (string $fileName): void {
    expect(ForbiddenUploadExtensionService::isForbidden($fileName))->toBeTrue();
    expect(fn () => ForbiddenUploadExtensionService::assertAllowed($fileName))
        ->toThrow(ValidationException::class);
})->with([
    'evil.php',
    'x.PHP',
    'img.jpg.php',
    'run.exe',
    'script.phtml',
    'payload.phar',
    'xss.svg',
    'page.html',
    'legacy.HTM',
    'ssi.shtml',
    'legacy.shtm',
    'data.xml',
    'doc.xhtml',
    'compact.xht',
    'mail.mht',
    'sheet.xsl',
    'icon.svgz',
]);

it('uses the given validation field on reject', function (): void {
    try {
        ForbiddenUploadExtensionService::assertAllowed('evil.php', 'file_name');
        $this->fail('Expected ValidationException');
    } catch (ValidationException $exception) {
        expect($exception->errors())->toHaveKey('file_name');
    }
});
