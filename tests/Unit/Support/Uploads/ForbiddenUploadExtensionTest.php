<?php

use App\Support\Uploads\ForbiddenUploadExtension;
use Illuminate\Validation\ValidationException;

it('allows safe extensions', function (string $fileName): void {
    expect(ForbiddenUploadExtension::isForbidden($fileName))->toBeFalse();
    ForbiddenUploadExtension::assertAllowed($fileName);
})->with([
    'photo.png',
    'doc.pdf',
    'archive.tar.gz',
    'readme',
]);

it('denies forbidden extensions', function (string $fileName): void {
    expect(ForbiddenUploadExtension::isForbidden($fileName))->toBeTrue();
    expect(fn () => ForbiddenUploadExtension::assertAllowed($fileName))
        ->toThrow(ValidationException::class);
})->with([
    'evil.php',
    'x.PHP',
    'img.jpg.php',
    'run.exe',
    'script.phtml',
    'payload.phar',
]);

it('uses the given validation field on reject', function (): void {
    try {
        ForbiddenUploadExtension::assertAllowed('evil.php', 'file_name');
        $this->fail('Expected ValidationException');
    } catch (ValidationException $exception) {
        expect($exception->errors())->toHaveKey('file_name');
    }
});
