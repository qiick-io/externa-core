<?php

use App\Support\Uploads\MimeTypeValidator;
use Illuminate\Validation\ValidationException;

it('accepts valid pdf jpeg png gif magic bytes', function (string $name, string $bytes): void {
    expect(MimeTypeValidator::assertAllowed($name, $bytes))->toBeString();
})->with([
    'pdf' => ['doc.pdf', "%PDF-1.4\n%âãÏÓ\n"],
    'jpeg' => ['photo.jpg', "\xFF\xD8\xFF\xE0\x00\x10JFIF"],
    'png' => ['photo.png', "\x89PNG\r\n\x1A\n\x00\x00\x00\x0D"],
    'gif87a' => ['anim.gif', 'GIF87a'.str_repeat("\x00", 10)],
    'gif89a' => ['anim2.gif', 'GIF89a'.str_repeat("\x00", 10)],
]);

it('rejects exe bytes renamed as pdf', function (): void {
    $exe = "MZ\x90\x00".str_repeat("\x00", 12);
    expect(fn () => MimeTypeValidator::assertAllowed('payload.pdf', $exe))
        ->toThrow(ValidationException::class);
});

it('rejects plain text renamed as png', function (): void {
    expect(fn () => MimeTypeValidator::assertAllowed('fake.png', 'not-a-png-image'))
        ->toThrow(ValidationException::class);
});

it('rejects sniffed mime outside the allowlist', function (): void {
    config()->set('files.upload_allowed_mimes', ['image/png']);

    expect(fn () => MimeTypeValidator::assertAllowed('doc.pdf', "%PDF-1.4\n"))
        ->toThrow(ValidationException::class);
});

it('assertAllowedPath reads only the header for magic', function (): void {
    $path = tempnam(sys_get_temp_dir(), 'mime');
    expect($path)->toBeString();
    file_put_contents($path, "%PDF-1.7\n".str_repeat('A', 4096));

    try {
        expect(MimeTypeValidator::assertAllowedPath('report.pdf', $path))->toBe('application/pdf');
    } finally {
        @unlink($path);
    }
});
