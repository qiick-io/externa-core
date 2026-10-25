<?php

namespace App\Http\Requests\Ai;

use App\Http\Controllers\Ai\CollectionImportWebhookController;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Symfony\Component\HttpFoundation\Response;

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
     */
    private function verifyWebhookSignature(): void
    {
        $configuredToken = (string) config('ai.webhook_token', '');

        // Fail closed outside local when the signing secret is unset.
        if ($configuredToken === '') {
            abort_unless(
                app()->environment('local'),
                Response::HTTP_UNAUTHORIZED,
                'Webhook signing is not configured.',
            );

            // Local with no token: allow unsigned requests for development only.
            return;
        }

        $providedSignature = (string) $this->header('X-AI-Webhook-Signature', '');

        abort_unless(
            hash_equals(
                CollectionImportWebhookController::sign($this->getContent(), $configuredToken),
                $providedSignature,
            ),
            Response::HTTP_UNAUTHORIZED,
            'Invalid webhook signature.',
        );
    }
}
