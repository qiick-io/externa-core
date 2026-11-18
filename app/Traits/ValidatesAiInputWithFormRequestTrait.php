<?php

declare(strict_types=1);

namespace App\Traits;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Routing\Redirector;
use Illuminate\Routing\Route;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Validate AI tool input with the same FormRequest the UI submits to, so a tool and the
 * screen it mirrors cannot drift apart: one set of rules, normalisation and after-hooks.
 *
 * The request runs outside the HTTP kernel: it gets the tool's input, the route parameters
 * its rules read (`$this->route('collection')`), and the acting user, then resolves as a
 * controller would. Failures come back as the tools' `Error:` strings, naming the tool
 * argument that failed (`Error: Invalid settings_json: …`).
 */
trait ValidatesAiInputWithFormRequestTrait
{
    /**
     * @param  class-string<FormRequest>  $formRequestClass
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $routeParameters
     * @param  array<string, string>  $argumentNames  request key => tool argument name, where they differ
     * @return array<string, mixed>|string the validated payload, or an `Error:` string
     */
    protected function validateWithFormRequest(
        string $formRequestClass,
        array $input,
        array $routeParameters = [],
        array $argumentNames = [],
    ): array|string {
        $formRequest = $formRequestClass::create('/', 'POST', $input);
        $formRequest->setContainer(app())->setRedirector(app(Redirector::class));
        $formRequest->setUserResolver(static fn () => auth()->user());

        $route = (new Route('POST', '/', []))->bind($formRequest);

        foreach ($routeParameters as $name => $value) {
            $route->setParameter($name, $value);
        }

        $formRequest->setRouteResolver(static fn (): Route => $route);

        try {
            $formRequest->validateResolved();
        } catch (ValidationException $exception) {
            $failures = [];

            foreach ($exception->errors() as $key => $messages) {
                $requestKey = explode('.', (string) $key, 2)[0];
                $failures[] = sprintf('Invalid %s: %s', $argumentNames[$requestKey] ?? $requestKey, implode(' ', $messages));
            }

            return 'Error: '.implode('; ', $failures);
        } catch (AuthorizationException|HttpExceptionInterface) {
            return 'Error: You cannot perform this operation.';
        }

        /** @var array<string, mixed> $validated */
        $validated = $formRequest->validated();

        return $validated;
    }
}
