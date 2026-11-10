<?php

declare(strict_types=1);

namespace App\Services\Ai;

/**
 * Redacts secrets and PII keys from AI tool argument payloads before audit logging.
 */
class AiToolArgumentRedactorService
{
    /**
     * Default sensitive argument keys (case-insensitive).
     *
     * @var list<string>
     */
    public const DEFAULT_SENSITIVE_KEYS = [
        'auth_bearer',
        'auth_header',
        'authorization',
        'bearer',
        'password',
        'token',
        'api_key',
        'apikey',
        'secret',
        'client_secret',
        'email',
        'phone',
        'telephone',
        'ssn',
        'social_security_number',
        'credit_card',
        'card_number',
        'cvv',
    ];

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function redact(array $input): array
    {
        $keys = $this->sensitiveKeys();

        return $this->redactRecursive($input, $keys);
    }

    /**
     * @return list<string>
     */
    public function sensitiveKeys(): array
    {
        $configured = config('ai.tools.redact_keys', self::DEFAULT_SENSITIVE_KEYS);

        if (! is_array($configured)) {
            return self::DEFAULT_SENSITIVE_KEYS;
        }

        $keys = [];

        foreach ($configured as $key) {
            if (! is_string($key)) {
                continue;
            }

            $trimmed = strtolower(trim($key));

            if ($trimmed !== '') {
                $keys[] = $trimmed;
            }
        }

        return $keys !== [] ? array_values(array_unique($keys)) : self::DEFAULT_SENSITIVE_KEYS;
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  list<string>  $sensitiveKeys
     * @return array<string, mixed>
     */
    private function redactRecursive(array $input, array $sensitiveKeys): array
    {
        foreach ($input as $key => $value) {
            if (is_string($key) && in_array(strtolower($key), $sensitiveKeys, true)) {
                if (is_string($value) && $value !== '') {
                    $input[$key] = '[redacted]';
                } elseif (is_array($value) || is_object($value)) {
                    $input[$key] = '[redacted]';
                }

                continue;
            }

            if (is_array($value)) {
                /** @var array<string, mixed> $value */
                $input[$key] = $this->redactRecursive($value, $sensitiveKeys);
            }
        }

        return $input;
    }
}
