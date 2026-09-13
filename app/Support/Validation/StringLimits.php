<?php

namespace App\Support\Validation;

/**
 * Shared string max lengths for BE validation and FE mirrors.
 *
 * CMS long defaults: textarea 10k; markdown/code/wysiwyg 65535 (MySQL TEXT).
 */
final class StringLimits
{
    public const SEARCH = 255;

    /** Chat hub thread search stays tighter than generic admin search. */
    public const SEARCH_CHAT_HUB = 120;

    public const NAME = 255;

    public const EMAIL = 255;

    public const USERNAME = 255;

    public const DESCRIPTION = 5000;

    public const DESCRIPTION_SHORT = 1024;

    public const NOTE = 1024;

    /** Default for CMS String / Select / Autocomplete / Color / Date when max_length unset. */
    public const CMS_STRING = 255;

    public const CMS_TEXTAREA = 10000;

    public const CMS_MARKDOWN = 65535;

    public const CMS_CODE = 65535;

    public const CMS_WYSIWYG = 65535;

    public const CHAT_MESSAGE = 20000;

    /** Filter operand string length (list / Public API / GraphQL). */
    public const FILTER_VALUE = 1024;

    public const FILTER_MAX_KEYS = 32;
}
