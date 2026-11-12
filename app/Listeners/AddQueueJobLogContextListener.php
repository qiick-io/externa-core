<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Enums\StructuredLogContextKeyEnum;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Context;

/**
 * Put the running job's class and attempt number in hidden Context for the `structured`
 * log channel (#209), and drop them when the job ends so a sync job does not leave them on
 * the request that dispatched it.
 *
 * Runs after the framework's own JobProcessing listener, which rehydrates the Context
 * (including the dispatching request's id) from the job payload.
 */
class AddQueueJobLogContextListener
{
    public function handleProcessing(JobProcessing $event): void
    {
        Context::addHidden([
            StructuredLogContextKeyEnum::Job->value => $event->job->resolveName(),
            StructuredLogContextKeyEnum::JobAttempt->value => $event->job->attempts(),
        ]);
    }

    public function handleFinished(JobProcessed|JobFailed|JobExceptionOccurred $event): void
    {
        Context::forgetHidden([StructuredLogContextKeyEnum::Job->value, StructuredLogContextKeyEnum::JobAttempt->value]);
    }
}
