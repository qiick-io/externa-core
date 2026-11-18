<?php

declare(strict_types=1);

namespace App\Logging;

use Monolog\LogRecord;
use Monolog\Processor\ProcessorInterface;

/**
 * Replace secrets in a record's `context` and `extra` with `[REDACTED]` (#209).
 *
 * Keys are compared case-insensitively after normalising camelCase, `-` and `.` to snake
 * case, at any depth, so `Authorization`, `HTTP_AUTHORIZATION`, `X-Api-Key`, `accessToken`
 * and `headers.cookie` are all caught. `token` matches only as the last word (`token`,
 * `csrf_token`, `access_token`), so AI usage counters such as `max_tokens` stay readable,
 * and `*_id` keys (`api_key_id`) are identifiers, not secrets.
 *
 * API key tokens are also caught by their shape, wherever they sit (the message, a value under
 * an innocent key, an exception string): the part after the public prefix is replaced, so the
 * log still says which key (`ext_live_AbCd1234[REDACTED]`) without carrying its secret.
 */
final class RedactSensitiveLogDataProcessor implements ProcessorInterface
{
    public const string REDACTED = '[REDACTED]';

    /** Matched anywhere in the normalised key. */
    private const array SENSITIVE_FRAGMENTS = [
        'authorization',
        'password',
        'passwd',
        'secret',
        'cookie',
        'api_key',
        'apikey',
        'private_key',
        'access_key',
        'key_hash',
        'recovery_code',
        'credential',
    ];

    /**
     * Current (`ext_<env>_<id>` + secret) and legacy (`ek_` + 40) API key tokens; group 1 is the
     * public prefix that is kept.
     */
    private const string API_KEY_TOKEN_PATTERN = '/\b(ext_(?:live|test)_[A-Za-z0-9]{8})[A-Za-z0-9]{32,}\b|\b(ek_[A-Za-z0-9]{9})[A-Za-z0-9]{31}\b/';

    /** Nested arrays deeper than this are replaced instead of walked. */
    private const int MAX_DEPTH = 10;

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(
            message: $this->redactApiKeyTokens($record->message),
            context: $this->redact($record->context, 0),
            extra: $this->redact($record->extra, 0),
        );
    }

    /**
     * @param  array<array-key, mixed>  $values
     * @return array<array-key, mixed>
     */
    private function redact(array $values, int $depth): array
    {
        foreach ($values as $key => $value) {
            if (is_string($key) && $this->isSensitiveKey($key)) {
                $values[$key] = self::REDACTED;

                continue;
            }

            if (is_array($value)) {
                $values[$key] = $depth >= self::MAX_DEPTH
                    ? self::REDACTED
                    : $this->redact($value, $depth + 1);

                continue;
            }

            if (is_string($value)) {
                $values[$key] = $this->redactApiKeyTokens($value);
            }
        }

        return $values;
    }

    private function redactApiKeyTokens(string $text): string
    {
        return (string) preg_replace_callback(
            self::API_KEY_TOKEN_PATTERN,
            static fn (array $tokenParts): string => ($tokenParts[1] !== '' ? $tokenParts[1] : $tokenParts[2]).self::REDACTED,
            $text,
        );
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalisedKey = strtolower((string) preg_replace(
            ['/(?<=[a-z0-9])(?=[A-Z])/', '/[^A-Za-z0-9]+/'],
            ['_', '_'],
            $key,
        ));

        // Identifiers such as `api_key_id` point at a record; they are not the secret itself.
        if (str_ends_with($normalisedKey, '_id')) {
            return false;
        }

        if (preg_match('/(^|_)token$/', $normalisedKey) === 1) {
            return true;
        }

        foreach (self::SENSITIVE_FRAGMENTS as $fragment) {
            if (str_contains($normalisedKey, $fragment)) {
                return true;
            }
        }

        return false;
    }
}
