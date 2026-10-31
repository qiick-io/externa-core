<?php

namespace App\Ai\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * SSRF-safe remote GET: DNS pin via CURLOPT_RESOLVE + streamed byte cap.
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
        $inspected = SafeRemoteUrlValidator::inspect($url, $allowPrivateHosts, $enforceHostAllowlist);

        if ($inspected['error'] !== null) {
            throw new RuntimeException(preg_replace('/^Error:\s*/', '', $inspected['error']) ?: $inspected['error']);
        }

        /** @var string $host */
        $host = $inspected['host'];
        /** @var int $port */
        $port = $inspected['port'];
        /** @var list<string> $ips */
        $ips = $inspected['ips'];

        $curlResolve = SafeRemoteUrlValidator::curlResolveEntries($host, $port, $ips);

        try {
            $pending = Http::timeout($timeoutSeconds)
                ->connectTimeout(10)
                ->withOptions([
                    'allow_redirects' => false,
                    'http_errors' => false,
                    'stream' => true,
                    'curl' => $curlResolve === [] ? [] : [
                        CURLOPT_RESOLVE => $curlResolve,
                    ],
                ])
                ->withHeaders($headers);

            $response = $pending->get($inspected['url']);
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

        $psrBody = $response->toPsrResponse()->getBody();
        $body = '';
        $bytes = 0;

        while (! $psrBody->eof()) {
            $chunk = $psrBody->read(8192);
            if ($chunk === '') {
                break;
            }
            $bytes += strlen($chunk);
            if ($bytes > $maxBytes) {
                throw new RuntimeException('Remote file is too large (max '.(int) ($maxBytes / 1024 / 1024).' MB).');
            }
            $body .= $chunk;
        }

        return [
            'body' => $body,
            'status' => $status,
            'content_type' => $contentType,
        ];
    }
}
