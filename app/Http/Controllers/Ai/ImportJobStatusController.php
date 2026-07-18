<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Jobs\ImportCollectionJob;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ImportJobStatusController extends Controller
{
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
