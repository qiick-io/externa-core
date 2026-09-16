<?php

namespace App\Http\Controllers;

use App\Support\Health\ReadinessChecks;
use Illuminate\Http\JsonResponse;

/**
 * Auth-free machine probes for Docker, load balancers, and orchestrators.
 *
 * Dashboard Pulse/Health UI is separate — these endpoints are not for humans.
 */
class HealthController extends Controller
{
    public function __construct(private readonly ReadinessChecks $readiness) {}

    /**
     * Liveness: process can answer HTTP. No dependency checks.
     */
    public function live(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
        ]);
    }

    /**
     * Readiness: safe to send traffic. Short timeouts; 503 when a required check fails.
     */
    public function ready(): JsonResponse
    {
        $checks = $this->readiness->run();
        $ready = ! in_array('fail', $checks, true);

        return response()->json([
            'status' => $ready ? 'ok' : 'fail',
            'checks' => $checks,
        ], $ready ? 200 : 503);
    }
}
