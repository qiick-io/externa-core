<?php

namespace App\Services\Collections;

/**
 * Allowlist HTML sanitizer for TipTap wysiwyg field values.
 *
 * ponytail: strip_tags + attribute scrub — upgrade to Symfony HtmlSanitizer if
 * we need CSS/style or data-uri policy nuance.
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

    public function sanitize(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        $trimmed = trim($html);
        if ($trimmed === '' || $trimmed === '<p></p>') {
            return null;
        }

        // Remove whole dangerous elements (strip_tags leaves their text content).
        $trimmed = preg_replace(
            '#<(script|style|iframe|object|embed|link|meta|form)[^>]*>.*?</\1>#is',
            '',
            $trimmed,
        ) ?? $trimmed;
        $trimmed = preg_replace(
            '#<(script|style|iframe|object|embed|link|meta|form)[^>]*/?>#is',
            '',
            $trimmed,
        ) ?? $trimmed;

        $allowed = '<'.implode('><', self::ALLOWED_TAGS).'>';
        $clean = strip_tags($trimmed, $allowed);

        // Drop event handlers / javascript: URLs on remaining tags
        $clean = preg_replace_callback(
            '/<([a-z0-9]+)(\s[^>]*)?>/i',
            function (array $matches): string {
                $tag = strtolower($matches[1]);
                $attrs = $matches[2] ?? '';

                if ($tag !== 'a' || $attrs === '') {
                    return '<'.$tag.'>';
                }

                $href = null;
                if (preg_match('/\shref\s*=\s*(["\'])(.*?)\1/i', $attrs, $m) === 1) {
                    $candidate = trim(html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    if ($candidate !== '' && ! preg_match('/^\s*javascript:/i', $candidate)) {
                        $href = htmlspecialchars($candidate, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    }
                }

                return $href === null ? '<a>' : '<a href="'.$href.'" rel="noopener noreferrer" target="_blank">';
            },
            $clean,
        ) ?? $clean;

        $clean = trim($clean);

        return $clean === '' || $clean === '<p></p>' ? null : $clean;
    }
}
