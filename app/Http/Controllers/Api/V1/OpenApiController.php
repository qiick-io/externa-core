<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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

        return response()->json($spec, 200, [
            'Cache-Control' => 'public, max-age=300',
        ]);
    }
}
