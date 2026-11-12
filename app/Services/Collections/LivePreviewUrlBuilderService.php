<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Http\Controllers\Api\V1\LivePreviewController;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Settings\ProjectSettingsService;
use Carbon\CarbonInterface;
use InvalidArgumentException;
use RuntimeException;

/**
 * Expands Live Preview URL templates and mints short-lived HMAC preview tokens.
 *
 * Tokens authorize {@see LivePreviewController} — never put API keys in the URL.
 */
class LivePreviewUrlBuilderService
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
        private readonly ProjectSettingsService $projectSettings,
        private readonly LivePreviewTokenService $tokens,
        private readonly LivePreviewAsOfResolverService $asOfResolver,
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
     *
     * When {@see $asOf} is set, schedule fields are included so reschedules invalidate the token.
     */
    public function contentHash(CollectionItem $item, string $version, ?CarbonInterface $asOf = null): string
    {
        $stamp = $item->updated_at?->getTimestamp() ?? 0;

        if ($asOf !== null) {
            return hash('sha256', implode('|', [
                (string) $stamp,
                (string) $asOf->getTimestamp(),
                (string) ($item->publish_at?->getTimestamp() ?? ''),
                (string) ($item->unpublish_at?->getTimestamp() ?? ''),
                json_encode($item->draft_data ?? [], JSON_THROW_ON_ERROR),
            ]));
        }

        if ($version === 'draft') {
            return hash('sha256', $stamp.'|'.json_encode($item->draft_data ?? [], JSON_THROW_ON_ERROR));
        }

        return hash('sha256', (string) $stamp);
    }

    /**
     * @param  'draft'|'published'  $version
     * @return array{url: string, expires_at: string, as_of: string|null}
     *
     * @throws InvalidArgumentException when as_of is out of bounds
     */
    public function build(
        Collection $collection,
        CollectionItem $item,
        string $version = 'published',
        ?string $locale = null,
        ?User $user = null,
        ?CarbonInterface $asOf = null,
    ): array {
        $template = $this->templateFor($collection);
        if ($template === null) {
            throw new RuntimeException('No Live Preview URL configured for this collection.');
        }

        if ($user === null) {
            throw new RuntimeException('Live Preview tokens require an issuing user.');
        }

        if ($asOf !== null) {
            $this->asOfResolver->assertWithinBound($asOf);
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
            contentHash: $this->contentHash($item, $version, $asOf),
            asOfTimestamp: $asOf?->getTimestamp(),
        );

        $url = $this->expandTemplate($template, [
            '{{id}}' => (string) $item->id,
            '{{slug}}' => $collection->slug,
            '{{collection}}' => $collection->slug,
            '{{locale}}' => $locale ?? '',
            '{{version}}' => $version,
            '{{token}}' => $token,
        ]);

        return [
            'url' => $url,
            'expires_at' => $expiresAt->utc()->format('Y-m-d\TH:i:s\Z'),
            'as_of' => $asOf?->utc()->format('Y-m-d\TH:i:s\Z'),
        ];
    }

    /**
     * Preview URL for a create form that has no item yet: `{{id}}` expands to an empty string and
     * the version is always `draft` (the payload is unpublished form state).
     *
     * @return array{url: string, expires_at: string, as_of: null}
     */
    public function buildForUnsavedDraft(
        Collection $collection,
        string $unsavedDraftId,
        ?string $locale,
        User $user,
    ): array {
        $template = $this->templateFor($collection);
        if ($template === null) {
            throw new RuntimeException('No Live Preview URL configured for this collection.');
        }

        $expiresAt = now()->addSeconds(self::TTL_SECONDS);
        $token = $this->tokens->mintUnsavedDraft(
            collectionId: $collection->id,
            unsavedDraftId: $unsavedDraftId,
            locale: $locale,
            expiresAt: $expiresAt->getTimestamp(),
            userId: (int) $user->id,
        );

        return [
            'url' => $this->expandTemplate($template, [
                '{{id}}' => '',
                '{{slug}}' => $collection->slug,
                '{{collection}}' => $collection->slug,
                '{{locale}}' => $locale ?? '',
                '{{version}}' => 'draft',
                '{{token}}' => $token,
            ]),
            'expires_at' => $expiresAt->utc()->format('Y-m-d\TH:i:s\Z'),
            'as_of' => null,
        ];
    }

    /**
     * Replace the template tokens, then drop empty query values from optional ones
     * (…?locale=&version=… → …?version=…).
     *
     * @param  array<string, string>  $replacements
     */
    private function expandTemplate(string $template, array $replacements): string
    {
        $url = strtr($template, $replacements);

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

        return $url;
    }
}
