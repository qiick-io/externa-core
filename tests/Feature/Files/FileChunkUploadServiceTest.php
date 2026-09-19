<?php

use App\Models\File;
use App\Models\FileUpload;
use App\Services\FileChunkUploadService;
use App\Services\FileService;
use App\Support\Uploads\ForbiddenUploadExtension;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    Storage::fake('assets');
    Storage::fake('private_assets');
});

it('resolves FileChunkUploadService and FileService façade from the container', function () {
    $chunks = app(FileChunkUploadService::class);
    $files = app(FileService::class);

    expect($chunks)->toBeInstanceOf(FileChunkUploadService::class)
        ->and($files)->toBeInstanceOf(FileService::class);
});

it('completes a chunked upload via FileChunkUploadService', function () {
    $service = app(FileChunkUploadService::class);
    $content = str_repeat('chunk-payload-', 100);

    $upload = $service->initChunkUpload(
        fileName: 'payload.bin',
        totalSize: strlen($content),
        totalChunks: 2,
        mimeType: 'application/octet-stream',
    );

    $mid = (int) ceil(strlen($content) / 2);
    $service->uploadChunk($upload->upload_id, 0, UploadedFile::fake()->createWithContent('p0.bin', substr($content, 0, $mid)));
    $service->uploadChunk($upload->upload_id, 1, UploadedFile::fake()->createWithContent('p1.bin', substr($content, $mid)));

    $status = $service->getUploadStatus($upload->upload_id);
    expect($status)->not->toBeNull()
        ->and($status['uploaded_chunks'])->toBe(2);

    $file = $service->completeChunkUpload($upload->upload_id);

    expect($file)->toBeInstanceOf(File::class)
        ->and($file->name)->toBe('payload.bin')
        ->and($file->size)->toBe(strlen($content))
        ->and(FileUpload::query()->where('upload_id', $upload->upload_id)->exists())->toBeFalse();

    Storage::disk($file->disk)->assertExists($file->storage_path);
});

it('FileService façade delegates chunk init to FileChunkUploadService', function () {
    $upload = app(FileService::class)->initChunkUpload(
        fileName: 'via-facade.bin',
        totalSize: 4,
        totalChunks: 1,
        mimeType: 'application/octet-stream',
    );

    expect($upload->file_name)->toBe('via-facade.bin')
        ->and(FileUpload::query()->where('upload_id', $upload->upload_id)->exists())->toBeTrue();
});

it('rejects forbidden extensions on chunk init (no-regression #85)', function () {
    expect(fn () => app(FileChunkUploadService::class)->initChunkUpload(
        fileName: 'evil.svg',
        totalSize: 10,
        totalChunks: 1,
    ))->toThrow(ValidationException::class);

    expect(FileUpload::query()->count())->toBe(0);
    expect(ForbiddenUploadExtension::isForbidden('evil.html'))->toBeTrue();
});

it('stores chunked uploads under private_assets when parent folder is private (no-regression #84)', function () {
    $folder = app(FileService::class)->createFolder('vault');
    app(FileService::class)->updateMetadata($folder, ['access' => 'private']);

    $service = app(FileChunkUploadService::class);
    $content = 'secret-bytes';

    $upload = $service->initChunkUpload(
        fileName: 'secret.bin',
        totalSize: strlen($content),
        totalChunks: 1,
        mimeType: 'application/octet-stream',
        parentId: $folder->id,
    );

    expect($upload->disk)->toBe('private_assets');

    $service->uploadChunk(
        $upload->upload_id,
        0,
        UploadedFile::fake()->createWithContent('secret.bin', $content),
    );

    $file = $service->completeChunkUpload($upload->upload_id);

    expect($file->disk)->toBe('private_assets');
    Storage::disk('private_assets')->assertExists($file->storage_path);
    Storage::disk('assets')->assertMissing($file->storage_path);
});
