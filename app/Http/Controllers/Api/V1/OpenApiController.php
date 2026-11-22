<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EmitBigintUserIdDeprecationHeadersMiddleware;
use Illuminate\Http\JsonResponse;
use Symfony\Component\Yaml\Yaml;

/**
 * Serves the Public CMS API OpenAPI 3 document (no API key / origin gate).
 */
class OpenApiController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $path = resource_path('openapi/public-cms-v1.yaml');
        /** @var array<string, mixed> $spec */
        $spec = Yaml::parseFile($path);

        // JSON examples follow the middleware; the YAML file keeps literals pinned by a test.
        $spec['components']['headers']['Deprecation']['schema']['example'] = '@'.EmitBigintUserIdDeprecationHeadersMiddleware::DEPRECATION_UNIX;
        $spec['components']['headers']['Sunset']['schema']['example'] = EmitBigintUserIdDeprecationHeadersMiddleware::sunsetHttpDate();

        return response()->json($spec, 200, [
            'Cache-Control' => 'public, max-age=300',
        ]);
    }
}
