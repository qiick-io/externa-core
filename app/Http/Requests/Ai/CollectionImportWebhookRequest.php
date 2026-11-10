<?php

namespace App\Http\Requests\Ai;

use App\Http\Controllers\Ai\CollectionImportWebhookController;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Validates inbound collection import webhook payloads after HMAC verification.
 */
class CollectionImportWebhookRequest extends FormRequest
{
    /**
     * Reject unsigned or mistimed signatures before validation runs.
     */
    public function authorize(): bool
    {
        $this->verifyWebhookSignature();

        return true;
    }

    /**
     * Validate the target collection and bounded record payload.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'collection_id' => ['required', 'integer', 'exists:collections,id'],
            'records' => ['required', 'array', 'min:1', 'max:500'],
            'records.*' => ['required', 'array'],
            'upsert_key' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Timing-safe HMAC over `"{timestamp}.{rawBody}"`, skew + replay checks.
     * Never logs the secret. Accepts current token, or previous during grace.
     */
    private function verifyWebhookSignature(): void
    {
        $tokens = $this->acceptableTokens();

        if ($tokens === []) {
            abort(
                Response::HTTP_UNAUTHORIZED,
                __('Webhook signing is not configured.'),
            );
        }

        $timestamp = (string) $this->header('X-AI-Webhook-Timestamp', '');
        if ($timestamp === '' || ! ctype_digit($timestamp)) {
            abort(
                Response::HTTP_UNAUTHORIZED,
                __('Webhook timestamp missing or invalid.'),
            );
        }

        $skew = abs(now()->getTimestamp() - (int) $timestamp);
        if ($skew > CollectionImportWebhookController::TIMESTAMP_TOLERANCE_SECONDS) {
            abort(
                Response::HTTP_UNAUTHORIZED,
                __('Webhook timestamp outside allowed skew.'),
            );
        }

        $providedSignature = (string) $this->header('X-AI-Webhook-Signature', '');
        $rawBody = $this->getContent();

        $matched = false;
        foreach ($tokens as $token) {
            if (hash_equals(
                CollectionImportWebhookController::sign($rawBody, $token, $timestamp),
                $providedSignature,
            )) {
                $matched = true;
                break;
            }
        }

        if (! $matched) {
            abort(
                Response::HTTP_UNAUTHORIZED,
                __('Invalid webhook signature.'),
            );
        }

        // Cache signature as nonce for the skew window (reject replays).
        $nonceKey = 'ai-webhook-nonce:'.hash('sha256', $providedSignature);
        if (! Cache::add($nonceKey, true, CollectionImportWebhookController::TIMESTAMP_TOLERANCE_SECONDS)) {
            abort(
                Response::HTTP_UNAUTHORIZED,
                __('Webhook replay detected.'),
            );
        }
    }

    /**
     * @return list<string>
     */
    private function acceptableTokens(): array
    {
        $tokens = [];

        $current = (string) config('ai.webhook_token', '');
        if ($current !== '') {
            $tokens[] = $current;
        }

        $previous = (string) config('ai.webhook_token_previous', '');
        $expiresAt = config('ai.webhook_token_previous_expires_at');
        if ($previous !== '' && is_string($expiresAt) && $expiresAt !== '') {
            try {
                if (Carbon::parse($expiresAt)->isFuture()) {
                    $tokens[] = $previous;
                }
            } catch (Throwable) {
                // Invalid expiry → ignore previous token (fail closed for grace).
            }
        }

        return $tokens;
    }
}
