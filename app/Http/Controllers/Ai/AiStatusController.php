<?php

declare(strict_types=1);

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\AppAssistant;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Ai\AiDailyBudgetService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Report whether the configured local AI provider is reachable, and the user's daily AI usage.
 */
class AiStatusController extends Controller
{
    /**
     * Return cached online/model status for the local AI provider.
     *
     * The provider status is cached for everyone; `daily_usage` is the requesting user's own and
     * is computed per request (null when no daily prompt cap or token budget is set).
     */
    public function __invoke(Request $request, AiDailyBudgetService $dailyBudget): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $perUser = [
            'context_window' => $this->contextWindow(),
            'daily_usage' => $dailyBudget->usage($user),
        ];

        // ponytail: short TTL on offline so a busy LM Studio load does not stick the FAB/translate gate.
        $cached = Cache::get('ai.status');

        if (is_array($cached) && ($cached['online'] ?? false) === true) {
            return response()->json([...$cached, ...$perUser]);
        }

        $status = $this->probeLocalProvider();
        Cache::put('ai.status', $status, ($status['online'] ?? false) ? 15 : 3);

        return response()->json([...$status, ...$perUser]);
    }

    /**
     * Context window (tokens) of the provider the assistant runs on, for the usage display.
     */
    private function contextWindow(): ?int
    {
        $window = config('ai.providers.'.(new AppAssistant)->provider().'.context_window');

        return is_numeric($window) && (int) $window > 0 ? (int) $window : null;
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
