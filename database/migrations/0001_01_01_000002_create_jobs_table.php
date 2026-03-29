<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * This method creates the tables required for Laravel's job queue system:
     * - jobs: Stores all pending jobs waiting to be processed.
     * - job_batches: Stores metadata for batch job processing.
     * - failed_jobs: Stores jobs that have failed after processing attempts.
     */
    public function up(): void
    {
        // Create jobs table to store pending jobs.
        Schema::create('jobs', function (Blueprint $table) {
            $table->id(); // Primary key for the job.
            $table->string('queue')->index(); // Name of the queue and indexed for fast lookup.
            $table->longText('payload'); // Serialized job data.
            $table->unsignedTinyInteger('attempts'); // Number of processing attempts.
            $table->unsignedInteger('reserved_at')->nullable(); // Timestamp when the job was reserved (nullable if not reserved).
            $table->unsignedInteger('available_at'); // When the job becomes available to process.
            $table->unsignedInteger('created_at'); // Timestamp the job was created.
        });

        // Create job_batches table to track batch jobs and their state.
        Schema::create('job_batches', function (Blueprint $table) {
            $table->string('id')->primary(); // UUID primary key for identifying the batch.
            $table->string('name'); // Batch name.
            $table->integer('total_jobs'); // Total jobs in the batch.
            $table->integer('pending_jobs'); // Number of jobs pending in this batch.
            $table->integer('failed_jobs'); // Number of jobs that have failed in the batch.
            $table->longText('failed_job_ids'); // IDs of jobs that have failed, stored as serialized data.
            $table->mediumText('options')->nullable(); // Batch options (JSON), nullable if not set.
            $table->integer('cancelled_at')->nullable(); // Timestamp when the batch was cancelled (nullable).
            $table->integer('created_at'); // Timestamp when the batch was created.
            $table->integer('finished_at')->nullable(); // Timestamp when the batch was finished (nullable).
        });

        // Create failed_jobs table to store jobs that have failed permanently.
        Schema::create('failed_jobs', function (Blueprint $table) {
            $table->id(); // Primary key for the failed job.
            $table->string('uuid')->unique(); // Unique identifier for the job.
            $table->text('connection'); // Connection name the job was processed on.
            $table->text('queue'); // Queue name the job was pulled from.
            $table->longText('payload'); // Serialized job data.
            $table->longText('exception'); // Exception details as a string.
            $table->timestamp('failed_at')->useCurrent(); // When the job failed (defaults to current timestamp).
        });
    }

    /**
     * Reverse the migrations.
     *
     * This method drops all tables related to job processing.
     */
    public function down(): void
    {
        // Drop the jobs table.
        Schema::dropIfExists('jobs');

        // Drop the job_batches table.
        Schema::dropIfExists('job_batches');

        // Drop the failed_jobs table.
        Schema::dropIfExists('failed_jobs');
    }
};
