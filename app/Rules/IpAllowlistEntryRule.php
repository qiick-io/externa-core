<?php

declare(strict_types=1);

namespace App\Rules;

use App\Models\ApiKey;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Translation\PotentiallyTranslatedString;

/**
 * Refuse a malformed IP / CIDR in an API key `ip_allowlist` at input time.
 *
 * Uses the same parser as {@see ApiKey::allowsIp()} ({@see ApiKey::isValidAllowlistEntry()}),
 * so a value that can never match a client is never stored.
 */
class IpAllowlistEntryRule implements ValidationRule
{
    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! ApiKey::isValidAllowlistEntry($value)) {
            $fail(__('Each allowlist entry must be a valid IPv4 or IPv6 address or CIDR.'));
        }
    }
}
