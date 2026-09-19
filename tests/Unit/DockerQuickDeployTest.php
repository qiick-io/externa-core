<?php

/**
 * Smoke assertions for Docker quick-deploy assets (#56).
 * ponytail: string presence only — full stack covered by compose-config CI + manual Docker smoke.
 */
it('ships quick-deploy Compose and env sample for GHCR pull path', function () {
    $root = dirname(__DIR__, 2);
    $compose = file_get_contents($root.'/compose.quick.yaml');
    $env = file_get_contents($root.'/.env.docker.quick.example');

    expect($compose)->toContain('ghcr.io/qiick-io/externa-core')
        ->and($compose)->toContain('/health/ready')
        ->and($compose)->toContain('RUN_SEED')
        ->and($compose)->toContain('RUN_MIGRATIONS')
        ->and($env)->toContain('APP_KEY=')
        ->and($env)->toContain('APP_URL=')
        ->and($env)->toContain('INITIAL_SUPER_ADMIN_')
        ->and($env)->toContain('RUN_SEED=false');
});

it('gates seed in entrypoint behind RUN_SEED', function () {
    $root = dirname(__DIR__, 2);
    $entrypoint = file_get_contents($root.'/docker/entrypoint.sh');

    expect($entrypoint)->toContain('RUN_SEED:-false')
        ->and($entrypoint)->toContain('db:seed --force')
        ->and($entrypoint)->toContain('RUN_MIGRATIONS:-false');
});
