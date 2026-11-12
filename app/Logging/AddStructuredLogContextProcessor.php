<?php

declare(strict_types=1);

namespace App\Logging;

use App\Enums\StructuredLogContextKeyEnum;
use App\Services\AppVersionService;
use App\Support\Api\ApiAccess;
use Illuminate\Container\Container;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Context;
use Monolog\LogRecord;
use Monolog\Processor\ProcessorInterface;

/**
 * Add request and job context to every record of the `structured` log channel (#209).
 *
 * Fields go into `extra`: `request_id`, `environment`, `app_version`, and when known `route`,
 * `user_id`, `api_key_id`, `job` and `job_attempt`. The actor and route are read at log time
 * because authentication runs after the request id middleware. Only an already resolved user
 * is read (`hasUser()`), so logging never triggers a session or database lookup.
 */
final class AddStructuredLogContextProcessor implements ProcessorInterface
{
    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(extra: [
            ...$record->extra,
            ...array_filter(
                [
                    'request_id' => Context::getHidden(StructuredLogContextKeyEnum::RequestId->value),
                    'environment' => App::environment(),
                    'app_version' => app(AppVersionService::class)->current(),
                    ...$this->requestFields(),
                    'job' => Context::getHidden(StructuredLogContextKeyEnum::Job->value),
                    'job_attempt' => Context::getHidden(StructuredLogContextKeyEnum::JobAttempt->value),
                ],
                static fn (mixed $value): bool => $value !== null,
            ),
        ]);
    }

    /**
     * @return array{route?: string|null, user_id?: int|string|null, api_key_id?: int|null}
     */
    private function requestFields(): array
    {
        $container = Container::getInstance();

        if (! $container->bound('request')) {
            return [];
        }

        $request = $container->make('request');

        if (! $request instanceof Request) {
            return [];
        }

        $apiAccess = $request->attributes->get('apiAccess');
        $guard = $container->resolved('auth') ? $container->make('auth')->guard() : null;

        return [
            'route' => $request->route()?->getName(),
            'user_id' => $guard?->hasUser() === true ? $guard->id() : null,
            'api_key_id' => $apiAccess instanceof ApiAccess ? $apiAccess->apiKey?->id : null,
        ];
    }
}
