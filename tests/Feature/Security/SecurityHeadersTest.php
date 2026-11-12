<?php

use App\Http\Middleware\SetSecurityHeadersMiddleware;
use App\Http\Responses\UserContentResponse;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;

/**
 * Run the middleware on a bare admin HTML response and return its headers.
 */
function securityHeadersForAdminPage(): ResponseHeaderBag
{
    return app(SetSecurityHeadersMiddleware::class)
        ->handle(request()->create('/collections', 'GET'), fn () => response('<html></html>'))
        ->headers;
}

/**
 * Extract one directive (e.g. `media-src ...`) from a Content-Security-Policy header.
 */
function contentSecurityPolicyDirective(ResponseHeaderBag $headers, string $directiveName): string
{
    foreach (explode(';', (string) $headers->get('Content-Security-Policy')) as $directive) {
        if (str_starts_with(trim($directive), $directiveName.' ')) {
            return trim($directive);
        }
    }

    return '';
}

beforeEach(function (): void {
    // Never pick up a developer's real public/hot file.
    Vite::useHotFile(storage_path('framework/testing/missing-vite-hot-file'));
});

it('sets defense headers on web HTML responses', function (): void {
    $this->withoutVite();

    $response = $this->get('/login');

    $response->assertOk();
    $response->assertHeader('X-Content-Type-Options', 'nosniff');
    $response->assertHeader('X-Frame-Options', 'DENY');
    $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect($response->headers->get('Permissions-Policy'))->toContain('camera=()')
        ->and($response->headers->get('Content-Security-Policy'))->toContain("default-src 'self'")
        ->and($response->headers->get('Content-Security-Policy'))->toContain("frame-ancestors 'none'");
});

it('does not apply admin CSP to public API JSON', function (): void {
    $response = $this->getJson('/api/v1/collections');

    // Unauthenticated public API may 200/403/503 depending on role seed; headers matter.
    expect($response->headers->has('Content-Security-Policy'))->toBeFalse();
});

it('does not overwrite an existing Content-Security-Policy header', function (): void {
    $response = response('user-bytes', 200, [
        'Content-Security-Policy' => UserContentResponse::CSP,
        'X-Content-Type-Options' => 'nosniff',
    ]);

    $middleware = app(SetSecurityHeadersMiddleware::class);
    $out = $middleware->handle(
        request()->create('/files/preview', 'GET'),
        fn () => $response,
    );

    expect($out->headers->get('Content-Security-Policy'))->toBe(UserContentResponse::CSP)
        ->and($out->headers->get('X-Frame-Options'))->toBe('DENY');
});

it('allows the microphone for self by default so AI voice input works', function (): void {
    $permissionsPolicy = securityHeadersForAdminPage()->get('Permissions-Policy');

    expect($permissionsPolicy)->toContain('microphone=(self)')
        ->and($permissionsPolicy)->not->toContain('microphone=()')
        ->and($permissionsPolicy)->toContain('camera=()');
});

it('blocks the microphone when operators turn AI voice input off', function (): void {
    config(['security.permissions_policy' => 'camera=(), microphone=(), geolocation=()']);

    expect(securityHeadersForAdminPage()->get('Permissions-Policy'))->toContain('microphone=()');
});

it('builds the default Content-Security-Policy for the local files disk', function (): void {
    config([
        'files.disk' => 'assets',
        'filesystems.disks.assets.url' => 'http://localhost/storage/assets',
    ]);

    $headers = securityHeadersForAdminPage();

    expect(contentSecurityPolicyDirective($headers, 'media-src'))->toBe("media-src 'self' blob: http://localhost")
        ->and(contentSecurityPolicyDirective($headers, 'img-src'))->toBe("img-src 'self' data: blob: https: http://localhost")
        ->and(contentSecurityPolicyDirective($headers, 'script-src'))->toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
        ->and(contentSecurityPolicyDirective($headers, 'font-src'))->toBe("font-src 'self' data:")
        ->and(contentSecurityPolicyDirective($headers, 'connect-src'))->toBe("connect-src 'self' ws: wss: http: https:")
        ->and(contentSecurityPolicyDirective($headers, 'frame-ancestors'))->toBe("frame-ancestors 'none'");
});

it('allows remote media and images from the configured files disk origin', function (string $disk, string $publicUrl, string $expectedOrigin): void {
    config([
        'files.disk' => $disk,
        "filesystems.disks.{$disk}.url" => $publicUrl,
    ]);

    $headers = securityHeadersForAdminPage();

    expect(contentSecurityPolicyDirective($headers, 'media-src'))->toBe("media-src 'self' blob: {$expectedOrigin}")
        ->and(contentSecurityPolicyDirective($headers, 'img-src'))->toEndWith(" {$expectedOrigin}");
})->with([
    'S3 bucket URL' => ['s3', 'https://externa-files.s3.eu-central-1.amazonaws.com/uploads', 'https://externa-files.s3.eu-central-1.amazonaws.com'],
    'MinIO over HTTP with a port' => ['s3', 'http://minio:9000/externa', 'http://minio:9000'],
    'GCS bucket URL' => ['gcs', 'https://storage.googleapis.com/externa-files', 'https://storage.googleapis.com'],
    'Azure Blob URL' => ['azure', 'https://externa.blob.core.windows.net/externa', 'https://externa.blob.core.windows.net'],
    'CDN in front of the local disk' => ['assets', 'https://cdn.example.com/storage/assets', 'https://cdn.example.com'],
]);

it('adds no remote media origin when the files disk has no public URL', function (): void {
    config([
        'files.disk' => 's3',
        'filesystems.disks.s3.url' => null,
    ]);

    expect(contentSecurityPolicyDirective(securityHeadersForAdminPage(), 'media-src'))->toBe("media-src 'self' blob:");
});

it('allows the running Vite dev server for scripts, styles, fonts and images', function (): void {
    $hotFile = tempnam(sys_get_temp_dir(), 'vite-hot-');
    file_put_contents($hotFile, "https://externa-core.test:5173\n");
    Vite::useHotFile($hotFile);

    try {
        $headers = securityHeadersForAdminPage();
    } finally {
        unlink($hotFile);
    }

    foreach (['script-src', 'style-src', 'font-src', 'img-src'] as $directiveName) {
        expect(contentSecurityPolicyDirective($headers, $directiveName))->toContain('https://externa-core.test:5173');
    }
});

it('returns the SECURITY_CSP override verbatim', function (): void {
    config(['security.csp' => "  default-src 'none'  "]);

    expect(securityHeadersForAdminPage()->get('Content-Security-Policy'))->toBe("default-src 'none'");
});
