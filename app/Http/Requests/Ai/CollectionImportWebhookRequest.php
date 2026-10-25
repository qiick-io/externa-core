<?php

namespace App\Http\Requests\Ai;

use App\Http\Controllers\Ai\CollectionImportWebhookController;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
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
     * Timing-safe HMAC check over the raw body. Never logs the secret.
     * Accepts the current token, or a non-expired previous token during grace.
     */
    private function verifyWebhookSignature(): void
    {
        $tokens = $this->acceptableTokens();

        if ($tokens === []) {
            abort(
                Response::HTTP_UNAUTHORIZED,
                'Webhook signing is not configured.',
            );
        }

        $providedSignature = (string) $this->header('X-AI-Webhook-Signature', '');
        $rawBody = $this->getContent();

        foreach ($tokens as $token) {
            if (hash_equals(
                CollectionImportWebhookController::sign($rawBody, $token),
                $providedSignature,
            )) {
                return;
            }
        }

        abort(
            Response::HTTP_UNAUTHORIZED,
            'Invalid webhook signature.',
        );
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
