<?php

namespace App\Support\Api;

/**
 * Parse Public REST `?include=` CSV into unique case-sensitive tokens.
 */
final class PublicApiIncludeParser
{
    public const TOKEN_FILES = 'files';

    public const TOKEN_USERS = 'users';

    /**
     * @return list<string> Sorted unique tokens (empty entries dropped).
     */
    public function parse(mixed $include): array
    {
        if ($include === null || $include === '') {
            return [];
        }

        if (is_array($include)) {
            $parts = $include;
        } elseif (is_string($include)) {
            $parts = explode(',', $include);
        } else {
            return [];
        }

        $tokens = [];
        foreach ($parts as $part) {
            if (! is_string($part) && ! is_numeric($part)) {
                continue;
            }
            $token = trim((string) $part);
            if ($token === '') {
                continue;
            }
            $tokens[$token] = true;
        }

        $list = array_keys($tokens);
        sort($list);

        return $list;
    }

    public function has(array $include, string $token): bool
    {
        return in_array($token, $include, true);
    }
}
