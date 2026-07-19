<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Jobs\ImportCollectionJob;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Expose background collection import job status for the authenticated user.
 */
class ImportJobStatusController extends Controller
{
    /**
     * Return import job progress when the job belongs to the current user.
     */
    public function __invoke(Request $request, string $jobId): Response
    {
        $status = ImportCollectionJob::status($jobId);

        abort_if(
            $status === null || $status['user_id'] !== $request->user()?->id,
            Response::HTTP_NOT_FOUND,
        );

        unset($status['user_id']);

        return response()->json($status);
    }
}
