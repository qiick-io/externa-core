<?php

use App\Enums\FilePermissionActionEnum;
use App\Enums\FileTypeEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\File;
use App\Models\FilePermission;
use App\Models\Role;
use App\Services\Api\FilePermissionGuard;
use App\Services\FileChunkUploadService;
use App\Support\Http\UserContentResponse;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('local');
    Storage::fake('assets');
    Storage::fake('public');
});

function fileSecUpload(string $name, string $body): UploadedFile
{
    $tmp = tempnam(sys_get_temp_dir(), 'fsec');
    file_put_contents($tmp, $body);

    return new UploadedFile($tmp, $name, null, null, true);
}

const FILE_SEC_HTML = "<!doctype html><html><body><script>/*poc*/</script></body></html>\n";

/**
 * @return array{plain: string, prefix: string, hash: string}
 */
function fileSecApiKeyWithCreateRead(): array
{
    $public = Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
    FilePermission::query()->updateOrCreate(
        ['role_id' => $public->id, 'action' => FilePermissionActionEnum::Read->value],
        ['allowed' => true],
    );
    app(FilePermissionGuard::class)->forget($public->id);

    $role = Role::query()->create([
        'name' => 'uploader-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    foreach ([FilePermissionActionEnum::Create, FilePermissionActionEnum::Read] as $action) {
        FilePermission::query()->updateOrCreate(
            ['role_id' => $role->id, 'action' => $action->value],
            ['allowed' => true],
        );
    }
    app(FilePermissionGuard::class)->forget($role->id);

    $secret = ApiKey::generateSecret();
    ApiKey::query()->create([
        'name' => 'sec',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
    ]);

    return $secret;
}

test('public api rejects html as txt svg as png and forbidden extensions', function () {
    $secret = fileSecApiKeyWithCreateRead();
    $svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>/*poc*/</script></svg>';

    $cases = [
        'readme.txt' => FILE_SEC_HTML,
        'logo.png' => $svg,
        'doc.svg' => $svg,
        'page.html' => FILE_SEC_HTML,
        'data.txt' => '<?xml version="1.0"?><x:script xmlns:x="http://www.w3.org/1999/xhtml">/*poc*/</x:script>',
    ];

    foreach ($cases as $name => $body) {
        $this->withHeader('Authorization', 'Bearer '.$secret['plain'])
            ->post('/api/v1/files', ['file' => fileSecUpload($name, $body)], ['Accept' => 'application/json'])
            ->assertUnprocessable();
    }
});

test('chunked file complete stores server-sniffed mime not client html', function () {
    $body = "safe plain text content\n";
    $service = app(FileChunkUploadService::class);

    $upload = $service->initChunkUpload(
        fileName: 'x.txt',
        totalSize: strlen($body),
        totalChunks: 1,
        mimeType: 'text/html',
    );
    $service->uploadChunk(
        $upload->upload_id,
        0,
        UploadedFile::fake()->createWithContent('blob', $body),
    );
    $file = $service->completeChunkUpload($upload->upload_id);

    expect($file->mime_type)->toBe('text/plain')
        ->and($file->mime_type)->not->toBe('text/html');
});

test('real png is served inline with nosniff and sandbox csp', function () {
    $secret = fileSecApiKeyWithCreateRead();

    $id = $this->withHeader('Authorization', 'Bearer '.$secret['plain'])
        ->post('/api/v1/files', [
            'file' => UploadedFile::fake()->image('photo.png', 32, 32),
        ], ['Accept' => 'application/json'])
        ->assertCreated()
        ->json('data.id');

    $this->flushHeaders();
    $res = $this->get("/api/v1/files/{$id}/content");
    $res->assertOk();
    expect($res->headers->get('Content-Disposition'))->toStartWith('inline')
        ->and($res->headers->get('Content-Type'))->toStartWith('image/png')
        ->and($res->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($res->headers->get('Content-Security-Policy'))->toBe(UserContentResponse::CSP);
});

test('legacy html file row is served as attachment octet-stream with nosniff sandbox', function () {
    fileSecApiKeyWithCreateRead();

    $path = 'files/legacy-'.Str::uuid().'.html';
    Storage::disk('local')->put($path, FILE_SEC_HTML);
    $file = File::query()->create([
        'parent_id' => null,
        'name' => 'legacy.html',
        'type' => FileTypeEnum::File,
        'path' => '/legacy.html',
        'disk' => 'local',
        'storage_path' => $path,
        'mime_type' => 'text/html',
        'extension' => 'html',
        'size' => strlen(FILE_SEC_HTML),
    ]);

    $res = $this->get("/api/v1/files/{$file->id}/content");
    $res->assertOk();
    expect($res->headers->get('Content-Disposition'))->toStartWith('attachment')
        ->and($res->headers->get('Content-Type'))->toStartWith('application/octet-stream')
        ->and($res->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($res->headers->get('Content-Security-Policy'))->toContain('sandbox');
});
