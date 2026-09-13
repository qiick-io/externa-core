<?php

namespace App\Support\Http;

use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Message\RequestInterface;

/**
 * Progressive SSE via curl_multi. Herd FPM + Guzzle stream:true returns empty bodies;
 * buffering works but tokens arrive in one burst. This streams bytes as LM Studio emits them.
 */
final class CurlSseStreamer
{
    /**
     * @return PromiseInterface<Response>
     */
    public static function stream(RequestInterface $request): PromiseInterface
    {
        $headers = [];

        foreach ($request->getHeaders() as $name => $values) {
            foreach ($values as $value) {
                $headers[] = $name.': '.$value;
            }
        }

        $body = (string) $request->getBody();
        $url = (string) $request->getUri();

        $curlOptions = [
            CURLOPT_CUSTOMREQUEST => $request->getMethod(),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_CONNECTTIMEOUT => 30,
        ];

        if ($body !== '') {
            $curlOptions[CURLOPT_POSTFIELDS] = $body;
        }

        $stream = new CurlMultiReadableStream($url, $curlOptions);
        $statusCode = $stream->statusCode();

        return Create::promiseFor(new Response(
            $statusCode > 0 ? $statusCode : 200,
            [
                'Content-Type' => 'text/event-stream',
                'Cache-Control' => 'no-cache',
            ],
            $stream,
        ));
    }
}
