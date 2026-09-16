<?php

/**
 * Auth-free liveness / readiness probes (Docker, LB, k8s-style).
 */

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health/live', [HealthController::class, 'live'])->name('health.live');
Route::get('/health/ready', [HealthController::class, 'ready'])->name('health.ready');
