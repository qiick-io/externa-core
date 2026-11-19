<?php

declare(strict_types=1);

namespace App\Ai\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * SSRF-safe remote GET: DNS pin via CURLOPT_CONNECT_TO + byte-capped body.
 *
 * Note: do not set Guzzle `stream => true` here — it bypasses Laravel Http::fake
 * and hits the real network (breaks AI import feature tests).
 */
final class SafeRemoteFetcher
{
    /**
     * @param  array<string, string>  $headers
     * @return array{body: string, status: int, content_type: ?string}
     */
    public static function get(
        string $url,
        int $maxBytes,
        array $headers = [],
        bool $allowPrivateHosts = false,
        bool $enforceHostAllowlist = true,
        int $timeoutSeconds = 30,
    ): array {
        $authorized = SafeRemoteUrlValidator::authorize($url, $allowPrivateHosts, $enforceHostAllowlist);

        if ($authorized['error'] !== null) {
            throw new RuntimeException(preg_replace('/^Error:\s*/', '', $authorized['error']) ?: $authorized['error']);
        }

        /** @var string $host */
        $host = $authorized['host'];

        try {
            $pending = Http::timeout($timeoutSeconds)
                ->connectTimeout(10)
                ->withOptions([
                    'allow_redirects' => false,
                    'http_errors' => false,
                    'curl' => [
                        CURLOPT_CONNECT_TO => $authorized['curl_connect_to'],
                    ],
                ])
                ->withHeaders($headers);

            $response = $pending->get($authorized['url']);
        } catch (ConnectionException $exception) {
            Log::warning('SafeRemoteFetcher connection failed', [
                'host' => $host,
                'message' => $exception->getMessage(),
            ]);

            throw new RuntimeException('Remote download failed.', 0, $exception);
        } catch (Throwable $exception) {
            Log::warning('SafeRemoteFetcher request failed', [
                'host' => $host,
                'message' => $exception->getMessage(),
            ]);

            throw new RuntimeException('Remote download failed.', 0, $exception);
        }

        $status = $response->status();
        $contentType = $response->header('Content-Type');
        $contentType = is_string($contentType) ? $contentType : null;

        $contentLength = $response->header('Content-Length');

        if (is_numeric($contentLength) && (int) $contentLength > $maxBytes) {
            throw new RuntimeException('Remote file is too large (max '.(int) ($maxBytes / 1024 / 1024).' MB).');
        }

        $body = $response->body();

        if (strlen($body) > $maxBytes) {
            throw new RuntimeException('Remote file is too large (max '.(int) ($maxBytes / 1024 / 1024).' MB).');
        }

        return [
            'body' => $body,
            'status' => $status,
            'content_type' => $contentType,
        ];
    }
}
