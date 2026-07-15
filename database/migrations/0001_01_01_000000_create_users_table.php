<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * This method is called when running `php artisan migrate`.
     */
    public function up(): void
    {
        // Create the 'users' table
        Schema::create('users', function (Blueprint $table) {
            $table->id(); // Primary key: auto-incrementing ID

            $table->boolean('is_active')->default(true); // Indicates if the user is active

            // Basic user info
            $table->string('first_name');
            $table->string('last_name')->nullable();

            // Unique username, can be null
            $table->string('username')->unique()->nullable();

            // Required, unique email for the user
            $table->string('email')->unique();

            // Timestamp for when the email was verified
            $table->timestamp('email_verified_at')->nullable();

            // Optional phone number
            $table->string('phone')->nullable();

            // Localization settings
            $table->string('locale')->default('en');
            $table->string('timezone')->default('UTC');

            // Last login records
            $table->dateTime('last_login_at')->nullable();
            $table->string('last_login_ip')->nullable();

            // Password (hashed string)
            $table->string('password');

            // Token used for "remember me" functionality
            $table->rememberToken();

            // Created at and updated at timestamps
            $table->timestamps();

            // Soft deletes support (adds deleted_at)
            $table->softDeletes();
        });

        // Table for password reset tokens (used for password recovery)
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary(); // Email as the primary key
            $table->string('token'); // The actual password reset token
            $table->timestamp('created_at')->nullable(); // When the token was created
        });

        // Table for storing session data
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary(); // Session ID
            $table->foreignId('user_id')->nullable()->index(); // Optional user ID, indexed
            $table->string('ip_address', 45)->nullable(); // Client IP address
            $table->text('user_agent')->nullable(); // User agent string (browser info)
            $table->longText('payload'); // Serialized session data
            $table->integer('last_activity')->index(); // Timestamp of last activity, indexed
        });
    }

    /**
     * Reverse the migrations.
     *
     * This method is called when running `php artisan migrate:rollback`.
     */
    public function down(): void
    {
        // Drop the created tables in reverse order to handle dependencies
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
