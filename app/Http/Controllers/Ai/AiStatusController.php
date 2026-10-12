<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Report whether the configured local AI provider is reachable.
 */
class AiStatusController extends Controller
{
    /**
     * Return cached online/model status for the local AI provider.
     */
    public function __invoke(): JsonResponse
    {
        // ponytail: short TTL on offline so a busy LM Studio load does not stick the FAB/translate gate.
        $cached = Cache::get('ai.status');

        if (is_array($cached) && ($cached['online'] ?? false) === true) {
            return response()->json($cached);
        }

        $status = $this->probeLocalProvider();
        Cache::put('ai.status', $status, ($status['online'] ?? false) ? 15 : 3);

        return response()->json($status);
    }

    /**
     * Probe LOCAL_AI_URL /models once.
     *
     * @return array{online: bool, model: string|null}
     */
    private function probeLocalProvider(): array
    {
        $baseUrl = rtrim((string) config('ai.providers.local.url', 'http://127.0.0.1:1234/v1'), '/');
        $apiKey = (string) config('ai.providers.local.key', '');
        $configuredModel = config('ai.providers.local.models.text.default');
        $fallbackModel = is_string($configuredModel) ? $configuredModel : null;

        try {
            $request = Http::timeout(2)->acceptJson();

            if ($apiKey !== '') {
                $request = $request->withToken($apiKey);
            }

            $response = $request->get($baseUrl.'/models');

            if (! $response->successful()) {
                return [
                    'online' => false,
                    'model' => $fallbackModel,
                ];
            }

            $models = collect($response->json('data') ?? [])
                ->pluck('id')
                ->filter()
                ->values();

            $model = is_string($configuredModel) && $configuredModel !== ''
                ? $configuredModel
                : $models->first();

            return [
                'online' => true,
                'model' => is_string($model) ? $model : null,
            ];
        } catch (ConnectionException) {
            return [
                'online' => false,
                'model' => $fallbackModel,
            ];
        } catch (\Throwable) {
            return [
                'online' => false,
                'model' => $fallbackModel,
            ];
        }
    }
}
