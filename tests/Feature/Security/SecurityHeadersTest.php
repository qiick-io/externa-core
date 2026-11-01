<?php

use App\Http\Middleware\SetSecurityHeadersMiddleware;
use App\Support\Http\UserContentResponse;

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
