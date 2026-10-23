<?php

namespace App\Support\Http;

use App\Support\Uploads\SafeUploadMime;
use Illuminate\Contracts\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Hardened responses for user-uploaded bytes (chat attachments, public file content).
 *
 * Defaults to Content-Disposition: attachment with nosniff + CSP sandbox.
 * Inline only for safe raster images when extension and type agree.
 */
final class UserContentResponse
{
    public const CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

    /**
     * @param  array<string, string>  $extraHeaders
     */
    public static function fromDisk(
        Filesystem $disk,
        string $path,
        string $downloadName,
        ?string $storedMime,
        array $extraHeaders = [],
    ): StreamedResponse {
        $serve = SafeUploadMime::forServe($storedMime, $downloadName);
        $disposition = $serve['inline'] ? 'inline' : 'attachment';

        $headers = array_merge([
            'Content-Type' => $serve['mime'],
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => self::CSP,
        ], $extraHeaders);

        return $disk->response($path, $downloadName, $headers, $disposition);
    }
}
