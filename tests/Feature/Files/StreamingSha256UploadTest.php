<?php

use App\Services\FileChunkUploadService;
use App\Services\FileService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(function (): void {
    Storage::fake('assets');
});

it('hashes uploads via path without UploadedFile::getContent and matches classic sha256', function (): void {
    // > a few MB so a full-string load would matter; content stable for hash assert.
    $payload = str_repeat("Externa streaming hash fixture\n", 120_000);
    expect(strlen($payload))->toBeGreaterThan(3_000_000);

    $expected = hash('sha256', $payload);
    $upload = UploadedFile::fake()->createWithContent('big-fixture.bin', $payload);

    $service = app(FileService::class);
    $pathHash = $service->hashPathSha256($service->absolutePathOfUpload($upload));
    expect($pathHash)->toBe($expected);

    $file = $service->uploadFile($upload);

    expect($file->hash)->toBe($expected)
        ->and(Storage::disk('assets')->exists($file->storage_path))->toBeTrue();
});

it('streams chunk merge hash to the same digest as a single-body upload', function (): void {
    $payload = str_repeat('chunk-body-', 50_000);
    $expected = hash('sha256', $payload);

    $chunks = str_split($payload, 40_000);

    $session = app(FileChunkUploadService::class)->initChunkUpload(
        fileName: 'chunked.bin',
        totalSize: strlen($payload),
        totalChunks: count($chunks),
        mimeType: 'application/octet-stream',
    );

    $uploadId = $session->upload_id;

    foreach ($chunks as $index => $chunkBody) {
        app(FileChunkUploadService::class)->uploadChunk(
            $uploadId,
            $index,
            UploadedFile::fake()->createWithContent("part-{$index}.bin", $chunkBody),
        );
    }

    $file = app(FileChunkUploadService::class)->completeChunkUpload($uploadId);

    expect($file->hash)->toBe($expected)
        ->and($file->name)->toBe('chunked.bin');
});

it('FileService uploadFile source no longer calls getContent on the happy path', function (): void {
    $source = file_get_contents(app_path('Services/FileService.php'));
    expect($source)->not->toBeFalse();

    // Narrow: uploadFile / replaceFile bodies must not use getContent.
    expect(Str::of((string) $source)->contains('uploadFile(UploadedFile'))->toBeTrue();

    preg_match(
        '/public function uploadFile\(UploadedFile.*?\n    public function /s',
        (string) $source,
        $uploadMatch,
    );
    expect($uploadMatch[0] ?? '')->not->toContain('getContent(');

    preg_match(
        '/public function replaceFile\(File \$file, UploadedFile.*?\n    public function /s',
        (string) $source,
        $replaceMatch,
    );
    expect($replaceMatch[0] ?? '')->not->toContain('getContent(');
});
