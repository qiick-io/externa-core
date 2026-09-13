<?php

namespace App\Services\Collections;

use Symfony\Component\HtmlSanitizer\HtmlSanitizer;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;

/**
 * Allowlist HTML sanitizer for TipTap wysiwyg field values (Symfony HtmlSanitizer).
 */
class WysiwygHtmlSanitizer
{
    /** @var list<string> */
    public const ALLOWED_TAGS = [
        'p', 'br', 'strong', 'b', 'em', 'i', 's', 'strike', 'u',
        'h1', 'h2', 'h3', 'h4', 'blockquote',
        'ul', 'ol', 'li',
        'a', 'code', 'pre', 'hr',
    ];

    private ?HtmlSanitizer $sanitizer = null;

    public function sanitize(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        $trimmed = trim($html);
        if ($trimmed === '' || $trimmed === '<p></p>') {
            return null;
        }

        $clean = trim($this->sanitizer()->sanitize($trimmed));

        return $clean === '' || $clean === '<p></p>' ? null : $clean;
    }

    private function sanitizer(): HtmlSanitizer
    {
        return $this->sanitizer ??= new HtmlSanitizer($this->config());
    }

    private function config(): HtmlSanitizerConfig
    {
        $config = (new HtmlSanitizerConfig)
            ->allowLinkSchemes(['http', 'https', 'mailto'])
            ->allowRelativeLinks(true)
            ->forceAttribute('a', 'rel', 'noopener noreferrer')
            ->forceAttribute('a', 'target', '_blank');

        foreach (self::ALLOWED_TAGS as $tag) {
            $config = $tag === 'a'
                ? $config->allowElement('a', ['href'])
                : $config->allowElement($tag);
        }

        return $config;
    }
}
