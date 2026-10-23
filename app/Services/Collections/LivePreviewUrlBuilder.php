<?php

namespace App\Services\Collections;

use App\Http\Controllers\Api\V1\LivePreviewController;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use RuntimeException;

/**
 * Expands Live Preview URL templates and mints short-lived HMAC preview tokens.
 *
 * Tokens authorize {@see LivePreviewController} — never put API keys in the URL.
 */
class LivePreviewUrlBuilder
{
    public const TTL_SECONDS = 300;

    /**
     * @var list<string>
     */
    public const TOKENS = [
        'id',
        'slug',
        'collection',
        'locale',
        'version',
        'token',
    ];

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly LivePreviewToken $tokens,
    ) {}

    public function templateFor(Collection $collection): ?string
    {
        $fromCollection = is_string($collection->preview_url) ? trim($collection->preview_url) : '';
        if ($fromCollection !== '') {
            return $fromCollection;
        }

        return $this->projectSettings->previewUrlDefault();
    }

    /**
     * Content fingerprint so draft/published edits can invalidate outstanding tokens.
     */
    public function contentHash(CollectionItem $item, string $version): string
    {
        $stamp = $item->updated_at?->getTimestamp() ?? 0;

        if ($version === 'draft') {
            return hash('sha256', $stamp.'|'.json_encode($item->draft_data ?? [], JSON_THROW_ON_ERROR));
        }

        return hash('sha256', (string) $stamp);
    }

    /**
     * @param  'draft'|'published'  $version
     * @return array{url: string, expires_at: string}
     */
    public function build(
        Collection $collection,
        CollectionItem $item,
        string $version = 'published',
        ?string $locale = null,
        ?User $user = null,
    ): array {
        $template = $this->templateFor($collection);
        if ($template === null) {
            throw new RuntimeException('No Live Preview URL configured for this collection.');
        }

        if ($user === null) {
            throw new RuntimeException('Live Preview tokens require an issuing user.');
        }

        $version = $version === 'draft' ? 'draft' : 'published';
        if ($version === 'draft' && ! $collection->versioning) {
            $version = 'published';
        }

        $expiresAt = now()->addSeconds(self::TTL_SECONDS);
        $token = $this->tokens->mint(
            collectionId: $collection->id,
            itemId: $item->id,
            version: $version,
            locale: $locale,
            expiresAt: $expiresAt->getTimestamp(),
            userId: (int) $user->id,
            contentHash: $this->contentHash($item, $version),
        );

        $replacements = [
            '{{id}}' => (string) $item->id,
            '{{slug}}' => $collection->slug,
            '{{collection}}' => $collection->slug,
            '{{locale}}' => $locale ?? '',
            '{{version}}' => $version,
            '{{token}}' => $token,
        ];

        $url = strtr($template, $replacements);

        // Drop empty query values from optional locale (…?locale=&version=… → …?version=…).
        $parts = parse_url($url);
        if (is_array($parts) && isset($parts['query'])) {
            parse_str($parts['query'], $query);
            $query = array_filter(
                $query,
                static fn (mixed $value): bool => ! (is_string($value) && $value === ''),
            );
            $rebuild = ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '');
            if (isset($parts['port'])) {
                $rebuild .= ':'.$parts['port'];
            }
            $rebuild .= $parts['path'] ?? '';
            if ($query !== []) {
                $rebuild .= '?'.http_build_query($query);
            }
            if (isset($parts['fragment'])) {
                $rebuild .= '#'.$parts['fragment'];
            }
            $url = $rebuild;
        }

        return [
            'url' => $url,
            'expires_at' => $expiresAt->utc()->format('Y-m-d\TH:i:s\Z'),
        ];
    }
}
