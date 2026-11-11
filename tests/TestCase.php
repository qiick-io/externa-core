<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;
use Laravel\Fortify\Features;

/**
 * Base test case with application-wide testing helpers.
 */
abstract class TestCase extends BaseTestCase
{
    /**
     * Every outgoing HTTP call in a test must be faked: an unfaked request throws instead of
     * reaching the network, so no test depends on (or calls) a live service (#288).
     */
    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    /**
     * Skip the current test when the given Fortify feature flag is disabled.
     *
     * @param  non-empty-string  $feature  Fortify feature name (see {@see Features} constants).
     * @param  string|null  $message  Optional skip reason shown in the test output.
     */
    protected function skipUnlessFortifyFeature(string $feature, ?string $message = null): void
    {
        if (! Features::enabled($feature)) {
            $this->markTestSkipped($message ?? "Fortify feature [{$feature}] is not enabled.");
        }
    }
}
