<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Hidden Context keys read by the `structured` log channel (#209).
 *
 * Hidden Context travels with queued jobs but is not appended to the other channels, so
 * the default `stack` / `single` output stays as it was.
 */
enum StructuredLogContextKeyEnum: string
{
    case RequestId = 'structured_log.request_id';
    case Job = 'structured_log.job';
    case JobAttempt = 'structured_log.job_attempt';
}
