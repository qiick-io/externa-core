<?php

declare(strict_types=1);

namespace App\Support\Logging;

/**
 * Hidden Context keys read by the `structured` log channel (#209).
 *
 * Hidden Context travels with queued jobs but is not appended to the other channels, so
 * the default `stack` / `single` output stays as it was.
 */
final class StructuredLogContext
{
    public const string REQUEST_ID = 'structured_log.request_id';

    public const string JOB = 'structured_log.job';

    public const string JOB_ATTEMPT = 'structured_log.job_attempt';
}
