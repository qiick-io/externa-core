<?php

declare(strict_types=1);

use App\Services\Ai\AiToolArgumentRedactorService;

it('redacts configured secret and PII keys case-insensitively', function (): void {
    config([
        'ai.tools.redact_keys' => ['password', 'token', 'email', 'auth_bearer'],
    ]);

    $redacted = app(AiToolArgumentRedactorService::class)->redact([
        'action' => 'create',
        'Password' => 'secret-value',
        'token' => 'abc',
        'email' => 'user@example.com',
        'nested' => [
            'auth_bearer' => 'Bearer xyz',
            'name' => 'ok',
        ],
    ]);

    expect($redacted['action'])->toBe('create')
        ->and($redacted['Password'])->toBe('[redacted]')
        ->and($redacted['token'])->toBe('[redacted]')
        ->and($redacted['email'])->toBe('[redacted]')
        ->and($redacted['nested']['auth_bearer'])->toBe('[redacted]')
        ->and($redacted['nested']['name'])->toBe('ok');
});
