<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table): void {
            $table->boolean('approvals_required')->default(false)->after('versioning');
        });

        Schema::table('collections_items', function (Blueprint $table): void {
            $table->string('approval_status', 32)->default('draft')->after('draft_data');
            $table->text('rejection_note')->nullable()->after('approval_status');
            $table->foreignId('submitted_by')->nullable()->after('rejection_note')->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->after('submitted_by')->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
            $table->index(['collection_id', 'approval_status']);
        });
    }

    public function down(): void
    {
        Schema::table('collections_items', function (Blueprint $table): void {
            $table->dropIndex(['collection_id', 'approval_status']);
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['approval_status', 'rejection_note', 'reviewed_at']);
        });

        Schema::table('collections', function (Blueprint $table): void {
            $table->dropColumn('approvals_required');
        });
    }
};
