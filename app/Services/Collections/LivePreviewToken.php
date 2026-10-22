<?php

namespace App\Services\Collections;

/**
 * HMAC-signed Live Preview tokens (short-lived; query-param safe).
 *
 * Format: base64url(json).base64url(hmac_sha256)
 *
 * Claims: c (collection), i (item), v (version), l (locale), exp,
 * u (issuing user id, required), h (optional content hash).
 */
class LivePreviewToken
{
    public function mint(
        int $collectionId,
        int $itemId,
        string $version,
        ?string $locale,
        int $expiresAt,
        int $userId,
        ?string $contentHash = null,
    ): string {
        $payload = [
            'c' => $collectionId,
            'i' => $itemId,
            'v' => $version === 'draft' ? 'draft' : 'published',
            'l' => $locale !== null && $locale !== '' ? $locale : null,
            'exp' => $expiresAt,
            'u' => $userId,
        ];

        if ($contentHash !== null && $contentHash !== '') {
            $payload['h'] = $contentHash;
        }

        $body = $this->b64(json_encode($payload, JSON_THROW_ON_ERROR));

        return $body.'.'.$this->b64($this->sign($body));
    }

    /**
     * @return array{
     *     collection_id: int,
     *     item_id: int,
     *     version: 'draft'|'published',
     *     locale: string|null,
     *     exp: int,
     *     user_id: int,
     *     content_hash: string|null
     * }|null
     */
    public function verify(string $token): ?array
    {
        $parts = explode('.', $token, 2);
        if (count($parts) !== 2) {
            return null;
        }

        [$body, $sig] = $parts;
        $expected = $this->b64($this->sign($body));
        if (! hash_equals($expected, $sig)) {
            return null;
        }

        $json = $this->ub64($body);
        if ($json === null) {
            return null;
        }

        try {
            /** @var array<string, mixed> $payload */
            $payload = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        $exp = isset($payload['exp']) ? (int) $payload['exp'] : 0;
        if ($exp < now()->getTimestamp()) {
            return null;
        }

        $collectionId = isset($payload['c']) ? (int) $payload['c'] : 0;
        $itemId = isset($payload['i']) ? (int) $payload['i'] : 0;
        $userId = isset($payload['u']) ? (int) $payload['u'] : 0;
        if ($collectionId < 1 || $itemId < 1 || $userId < 1) {
            return null;
        }

        $version = ($payload['v'] ?? '') === 'draft' ? 'draft' : 'published';
        $locale = isset($payload['l']) && is_string($payload['l']) && $payload['l'] !== ''
            ? $payload['l']
            : null;
        $contentHash = isset($payload['h']) && is_string($payload['h']) && $payload['h'] !== ''
            ? $payload['h']
            : null;

        return [
            'collection_id' => $collectionId,
            'item_id' => $itemId,
            'version' => $version,
            'locale' => $locale,
            'exp' => $exp,
            'user_id' => $userId,
            'content_hash' => $contentHash,
        ];
    }

    private function sign(string $body): string
    {
        return hash_hmac('sha256', $body, (string) config('app.key'), true);
    }

    private function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private function ub64(string $encoded): ?string
    {
        $pad = 4 - (strlen($encoded) % 4);
        if ($pad < 4) {
            $encoded .= str_repeat('=', $pad);
        }

        $decoded = base64_decode(strtr($encoded, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
