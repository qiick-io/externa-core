<?php

namespace App\Support\Http;

use Psr\Http\Message\StreamInterface;
use RuntimeException;

/**
 * PSR-7 stream backed by curl_multi + WRITEFUNCTION so SSE bytes arrive while
 * the consumer reads — works under Herd PHP-FPM where Guzzle stream:true is empty.
 */
class CurlMultiReadableStream implements StreamInterface
{
    private string $buffer = '';

    private bool $eof = false;

    private bool $started = false;

    /** @var \CurlHandle|resource|null */
    private mixed $curlHandle = null;

    /** @var \CurlMultiHandle|resource|null */
    private mixed $multiHandle = null;

    private int $statusCode = 0;

    /**
     * @param  array<int, mixed>  $curlOptions
     */
    public function __construct(
        private readonly string $url,
        private readonly array $curlOptions = [],
    ) {}

    public function statusCode(): int
    {
        $this->ensureStarted();

        return $this->statusCode > 0 ? $this->statusCode : 200;
    }

    public function __toString(): string
    {
        try {
            return $this->getContents();
        } catch (\Throwable) {
            return '';
        }
    }

    public function close(): void
    {
        $this->detach();
    }

    public function detach()
    {
        if ($this->multiHandle !== null && $this->curlHandle !== null) {
            curl_multi_remove_handle($this->multiHandle, $this->curlHandle);
        }

        if ($this->curlHandle !== null) {
            curl_close($this->curlHandle);
            $this->curlHandle = null;
        }

        if ($this->multiHandle !== null) {
            curl_multi_close($this->multiHandle);
            $this->multiHandle = null;
        }

        $this->eof = true;

        return null;
    }

    public function getSize(): ?int
    {
        return null;
    }

    public function tell(): int
    {
        throw new RuntimeException('CurlMultiReadableStream does not support tell()');
    }

    public function eof(): bool
    {
        $this->ensureStarted();

        return $this->eof && $this->buffer === '';
    }

    public function isSeekable(): bool
    {
        return false;
    }

    public function seek(int $offset, int $whence = SEEK_SET): void
    {
        throw new RuntimeException('CurlMultiReadableStream is not seekable');
    }

    public function rewind(): void
    {
        throw new RuntimeException('CurlMultiReadableStream is not seekable');
    }

    public function isWritable(): bool
    {
        return false;
    }

    public function write(string $string): int
    {
        throw new RuntimeException('CurlMultiReadableStream is not writable');
    }

    public function isReadable(): bool
    {
        return true;
    }

    public function read(int $length): string
    {
        if ($length < 1) {
            return '';
        }

        $this->ensureStarted();
        $this->pumpUntil(fn (): bool => strlen($this->buffer) >= $length || $this->eof);

        if ($this->buffer === '') {
            return '';
        }

        $chunk = substr($this->buffer, 0, $length);
        $this->buffer = substr($this->buffer, strlen($chunk));

        return $chunk;
    }

    public function getContents(): string
    {
        $contents = '';

        while (! $this->eof()) {
            $contents .= $this->read(8192);
        }

        return $contents;
    }

    public function getMetadata(?string $key = null)
    {
        $meta = [
            'timed_out' => false,
            'blocked' => true,
            'eof' => $this->eof(),
            'wrapper_type' => 'curl_multi',
            'stream_type' => 'curl_multi',
            'mode' => 'r',
            'unread_bytes' => strlen($this->buffer),
            'seekable' => false,
            'uri' => $this->url,
            'status_code' => $this->statusCode(),
        ];

        if ($key === null) {
            return $meta;
        }

        return $meta[$key] ?? null;
    }

    private function ensureStarted(): void
    {
        if ($this->started) {
            return;
        }

        $this->started = true;
        $this->curlHandle = curl_init($this->url);

        if ($this->curlHandle === false) {
            $this->eof = true;

            throw new RuntimeException('Unable to initialize curl for SSE stream.');
        }

        $options = $this->curlOptions + [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_HEADER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_WRITEFUNCTION => function ($curlHandle, string $data): int {
                $this->buffer .= $data;

                return strlen($data);
            },
            CURLOPT_HEADERFUNCTION => function ($curlHandle, string $headerLine): int {
                if (preg_match('/^HTTP\/\S+\s+(\d+)/', $headerLine, $matches) === 1) {
                    $this->statusCode = (int) $matches[1];
                }

                return strlen($headerLine);
            },
        ];

        curl_setopt_array($this->curlHandle, $options);

        $this->multiHandle = curl_multi_init();
        curl_multi_add_handle($this->multiHandle, $this->curlHandle);
        $this->pumpUntil(fn (): bool => $this->statusCode > 0 || $this->buffer !== '' || $this->eof);
    }

    /**
     * @param  callable(): bool  $ready
     */
    private function pumpUntil(callable $ready): void
    {
        if ($this->multiHandle === null || $this->curlHandle === null) {
            return;
        }

        while (! $ready()) {
            do {
                $status = curl_multi_exec($this->multiHandle, $running);
            } while ($status === CURLM_CALL_MULTI_PERFORM);

            if ($status !== CURLM_OK) {
                $this->eof = true;

                break;
            }

            if ($ready()) {
                break;
            }

            if ($running === 0) {
                $this->eof = true;

                break;
            }

            curl_multi_select($this->multiHandle, 1.0);
        }

        if ($this->statusCode === 0 && $this->curlHandle !== null) {
            $this->statusCode = (int) curl_getinfo($this->curlHandle, CURLINFO_HTTP_CODE);
        }
    }
}
