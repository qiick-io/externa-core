<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Catalog status of an AI model (#370). Unverified covers every model the catalog does not
 * list, such as LOCAL_AI_MODEL: it stays allowed, it is just not vouched for.
 */
enum AiModelStatusEnum: string
{
    case Recommended = 'recommended';
    case Supported = 'supported';
    case Deprecated = 'deprecated';
    case Unverified = 'unverified';
}
