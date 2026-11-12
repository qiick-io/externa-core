<?php

declare(strict_types=1);

use App\Enums\StructuredLogContextKeyEnum;
use App\Http\Middleware\AssignRequestIdMiddleware;
use App\Http\Middleware\ResolveApiAccessMiddleware;
use App\Logging\RedactSensitiveLogDataProcessor;
use App\Models\User;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;

/**
 * Point a log channel at a fresh temporary file and return the file's path.
 */
function redirectLogChannelToFile(string $channelName, string $configKey): string
{
    $logPath = tempnam(sys_get_temp_dir(), 'externa-log-');

    config(["logging.channels.{$channelName}.{$configKey}" => $logPath]);
    Log::forgetChannel($channelName);

    return $logPath;
}

/**
 * @return list<array<string, mixed>>
 */
function structuredLogRecords(string $logPath): array
{
    $logLines = array_values(array_filter(explode("\n", (string) file_get_contents($logPath))));

    return array_map(
        static fn (string $logLine): array => json_decode($logLine, true, flags: JSON_THROW_ON_ERROR),
        $logLines,
    );
}

beforeEach(function (): void {
    $this->structuredLogPath = redirectLogChannelToFile('structured', 'handler_with.stream');
});

afterEach(function (): void {
    @unlink($this->structuredLogPath);
});

test('the structured channel writes one JSON object per line with environment and version', function (): void {
    Log::channel('structured')->info('First {subject}', ['subject' => 'entry']);
    Log::channel('structured')->warning("Second\nentry");

    $logLines = array_values(array_filter(explode("\n", (string) file_get_contents($this->structuredLogPath))));

    expect($logLines)->toHaveCount(2);

    [$firstRecord, $secondRecord] = structuredLogRecords($this->structuredLogPath);
    $composerVersion = json_decode((string) file_get_contents(base_path('composer.json')), true)['version'];

    expect($firstRecord)
        ->message->toBe('First entry')
        ->level_name->toBe('INFO')
        ->channel->toBe('testing')
        ->and($firstRecord['extra'])->toMatchArray([
            'environment' => 'testing',
            'app_version' => $composerVersion,
        ])
        ->and($secondRecord['message'])->toBe("Second\nentry");
});

test('a request without an id gets a generated X-Request-Id that its log lines carry', function (): void {
    Route::get('/_test/structured-log', function () {
        Log::channel('structured')->info('Inside the request');

        return response('ok');
    })->name('test.structured-log');

    $response = $this->get('/_test/structured-log');

    $requestId = $response->headers->get(AssignRequestIdMiddleware::HEADER);

    expect($requestId)->toBeString()->toMatch('/\A[0-9a-f-]{36}\z/');

    $logRecord = structuredLogRecords($this->structuredLogPath)[0];

    expect($logRecord['extra'])->toMatchArray([
        'request_id' => $requestId,
        'route' => 'test.structured-log',
    ]);
});

test('a well-formed incoming X-Request-Id is kept', function (): void {
    $this->get('/up', [AssignRequestIdMiddleware::HEADER => 'lb-01:7f3a9c2e.request_42'])
        ->assertHeader(AssignRequestIdMiddleware::HEADER, 'lb-01:7f3a9c2e.request_42');
});

test('a malformed incoming X-Request-Id is replaced', function (string $incomingRequestId): void {
    $responseRequestId = $this->get('/up', [AssignRequestIdMiddleware::HEADER => $incomingRequestId])
        ->headers->get(AssignRequestIdMiddleware::HEADER);

    expect($responseRequestId)
        ->not->toBe($incomingRequestId)
        ->toMatch('/\A[0-9a-f-]{36}\z/');
})->with([
    'too short' => ['abc'],
    'too long' => [str_repeat('a', 129)],
    'log injection' => ["abcdefgh\n{\"level\":\"EMERGENCY\"}"],
    'spaces and quotes' => ['abc def "ghi"'],
]);

test('rejected API requests still carry an X-Request-Id', function (): void {
    $this->withToken('not-a-real-key')
        ->getJson('/api/v1/collections')
        ->assertUnauthorized()
        ->assertHeader(AssignRequestIdMiddleware::HEADER);

    $this->getJson('/api/v1/this-route-does-not-exist')
        ->assertNotFound()
        ->assertHeader(AssignRequestIdMiddleware::HEADER);
});

test('log lines name the API key behind an API request', function (): void {
    Route::get('/_test/structured-log-api', function () {
        Log::channel('structured')->info('Inside an API request');

        return response('ok');
    })->middleware(ResolveApiAccessMiddleware::class);

    $apiKeyAuth = makeApiKeyForRole();

    $this->withToken($apiKeyAuth['plain'])->get('/_test/structured-log-api')->assertOk();

    expect(structuredLogRecords($this->structuredLogPath)[0]['extra'])
        ->toMatchArray(['api_key_id' => $apiKeyAuth['key']->id])
        ->not->toHaveKey('user_id');
});

test('log lines name the signed-in user', function (): void {
    Route::get('/_test/structured-log-user', function () {
        Log::channel('structured')->info('Inside a signed-in request');

        return response('ok');
    })->middleware(['web', 'auth']);

    $user = User::factory()->create();

    $this->actingAs($user)->get('/_test/structured-log-user')->assertOk();

    expect(structuredLogRecords($this->structuredLogPath)[0]['extra'])
        ->toMatchArray(['user_id' => $user->id])
        ->not->toHaveKey('api_key_id');
});

test('queued jobs log their class, attempt and the dispatching request id', function (): void {
    Context::addHidden(StructuredLogContextKeyEnum::RequestId->value, 'request-from-web-1');

    dispatch(function (): void {
        Log::channel('structured')->info('Inside a job');
    })->onConnection('sync');

    $logExtra = structuredLogRecords($this->structuredLogPath)[0]['extra'];

    expect($logExtra)
        ->toMatchArray(['request_id' => 'request-from-web-1', 'job_attempt' => 1])
        ->and($logExtra['job'])->toBeString()->toContain('Closure')
        ->and(Context::hasHidden(StructuredLogContextKeyEnum::Job->value))->toBeFalse();
});

test('sensitive keys are redacted at any depth', function (): void {
    Log::channel('structured')->info('Outgoing call to {url} with {api_key}', [
        'url' => 'https://example.test',
        'api_key' => 'sk-live-123',
        'password' => 'hunter2',
        'max_tokens' => 1024,
        'api_key_id' => 7,
        'headers' => [
            'Authorization' => ['Bearer abc.def'],
            'Cookie' => 'externa_session=xyz',
            'X-Api-Key' => 'abc',
            'Accept' => 'application/json',
        ],
        'payload' => [
            'nested' => ['accessToken' => 'tok', 'client_secret' => 'shh', 'title' => 'Hello'],
            '_token' => 'csrf',
        ],
    ]);

    $logRecord = structuredLogRecords($this->structuredLogPath)[0];
    $redacted = RedactSensitiveLogDataProcessor::REDACTED;

    expect($logRecord['message'])->toBe("Outgoing call to https://example.test with {$redacted}")
        ->and($logRecord['context'])->toMatchArray([
            'api_key' => $redacted,
            'password' => $redacted,
            'max_tokens' => 1024,
            'api_key_id' => 7,
            'headers' => [
                'Authorization' => $redacted,
                'Cookie' => $redacted,
                'X-Api-Key' => $redacted,
                'Accept' => 'application/json',
            ],
            'payload' => [
                'nested' => ['accessToken' => $redacted, 'client_secret' => $redacted, 'title' => 'Hello'],
                '_token' => $redacted,
            ],
        ])
        ->and((string) file_get_contents($this->structuredLogPath))
        ->not->toContain('hunter2', 'sk-live-123', 'abc.def', 'xyz', 'shh');
});

test('the default channel output is unchanged', function (): void {
    expect(config('logging.channels.stack.channels'))->not->toContain('structured');

    $singleLogPath = redirectLogChannelToFile('single', 'path');
    Context::addHidden(StructuredLogContextKeyEnum::RequestId->value, 'request-not-in-plain-logs');

    Log::channel('single')->info('Plain text line');

    $logContents = (string) file_get_contents($singleLogPath);
    @unlink($singleLogPath);

    expect($logContents)
        ->toMatch('/\A\[[^\]]+\] testing\.INFO: Plain text line *\R\z/')
        ->not->toContain('request-not-in-plain-logs');
});
