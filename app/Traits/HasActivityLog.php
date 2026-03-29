<?php

namespace App\Traits;

use App\Enums\ActivityLogActionEnum;
use App\Models\ActivityLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

/**
 * Trait HasActivityLog.
 *
 * This trait enables automatic activity logging for Eloquent models,
 * tracking create, update, delete and restore events. It also provides
 * convenient relationship accessors for activity logs and actor users.
 *
 * @property int $created_by Identifier for the user who created the model.
 * @property int $updated_by Identifier for the user who last updated the model.
 * @property int $deleted_by Identifier for the user who deleted the model (if soft deletes are enabled).
 * @property \Illuminate\Support\Carbon $deleted_at Timestamp for when the model was soft-deleted.
 */
trait HasActivityLog
{
    /**
     * Boot the HasActivityLog trait for a model.
     *
     * This method is invoked by Laravel automatically when the model boots.
     * It registers the required model event listeners for activity logging.
     *
     * @return void
     */
    public static function bootHasActivityLog()
    {
        // Register event listeners for activity logging
        static::registerListeners();
    }

    /**
     * Register model event listeners for activity logging.
     *
     * Attaches actions to the model's 'created', 'updated', 'deleted', and 'restored' events.
     * Automatically records who performed the action and the action details.
     *
     * @return void
     */
    public static function registerListeners()
    {
        // Listen to the "created" event and log activity
        static::created(function ($model) {
            self::storeActivity(
                ActivityLogActionEnum::STORE->value,
                $model->toArray(),
                $model->id
            );
            // Set the creator's user ID (defaults to 1 if no user authenticated)
            $model->created_by = Auth::check() ? Auth::id() : 1;
            $model->saveQuietly(); // Avoids recursion on events
        });

        // Listen to the "updated" event and log activity
        static::updated(function ($model) {
            self::storeActivity(
                ActivityLogActionEnum::UPDATE->value,
                $model->getChanges(),
                $model->id
            );
            // Set the updater's user ID (defaults to 1 if no user authenticated)
            $model->updated_by = Auth::check() ? Auth::id() : 1;
            $model->saveQuietly();
        });

        // Only register delete/restore events if SoftDeletes trait is being used
        if (static::usingSoftDeletes()) {
            // Listen to the "deleted" event and log activity
            static::deleted(function ($model) {
                self::storeActivity(
                    ActivityLogActionEnum::DELETE->value,
                    null,
                    $model->id
                );
                // Set the deleter's user ID (defaults to 1 if no user authenticated)
                $model->deleted_by = Auth::check() ? Auth::id() : 1;
                $model->saveQuietly();
            });

            // Listen to the "restored" event and log activity
            static::restored(function ($model) {
                self::storeActivity(
                    ActivityLogActionEnum::RESTORE->value,
                    null,
                    $model->id
                );
                // Reset the deleted_by column since the model is restored
                $model->deleted_by = null;
                $model->saveQuietly();
            });
        }
    }

    /**
     * Store a new activity log entry associated with the given model.
     *
     * @param string $action The action performed (create, update, delete, etc).
     * @param mixed $payload Data snapshot or changed fields relevant to the action.
     * @param int $model_id Identifier of the affected model instance.
     * @param int|null $user_id Identifier of the user performing the action. Defaults to authenticated user or 1.
     * @param \Carbon\Carbon|string|null $date Timestamp for the activity. Defaults to now.
     *
     * @return void
     */
    public static function storeActivity($action, $payload, $model_id, $user_id = null, $date = null): void
    {
        // Fallback to authenticated user or default system user
        if (is_null($user_id)) {
            $user_id = Auth::check() ? Auth::id() : 1;
        }

        // Use the current time if date is not specified
        if (is_null($date)) {
            $date = Carbon::now();
        }

        // Create the activity log record with relevant details
        ActivityLog::create([
            'action'      => $action,
            'method'      => Route::getCurrentRoute() ? Route::getCurrentRoute()->getActionName() : null,
            'payload'     => $payload,
            'user_id'     => $user_id,
            'entity_type' => static::class,
            'entity_id'   => $model_id,
            'date'        => $date,
        ]);
    }

    /**
     * Determine if the model uses the SoftDeletes trait.
     *
     * @return bool True if the model uses soft deletes, false otherwise.
     */
    public static function usingSoftDeletes(): bool
    {
        // Cache the result per-class to avoid repeated reflection cost
        static $usingSoftDeletes;

        if (is_null($usingSoftDeletes)) {
            $usingSoftDeletes = in_array(
                'Illuminate\Database\Eloquent\SoftDeletes',
                class_uses_recursive(get_called_class())
            );
            return $usingSoftDeletes;
        }

        return $usingSoftDeletes;
    }

    /**
     * Get all activity log records related to this model.
     *
     * @return \Illuminate\Database\Eloquent\Relations\MorphMany
     */
    public function activities(): MorphMany
    {
        return $this->morphMany(ActivityLog::class, 'entity');
    }

    /**
     * Relationship: Get the user associated with this entity via user_id.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Relationship: Get the user who created this entity.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Relationship: Get the user who last updated this entity.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Relationship: Get the user who deleted this entity (if soft deletes are enabled).
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function deleter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    /**
     * Retrieve all activities for this model.
     *
     * @return mixed Collection of activity logs associated with the model.
     */
    public function getActivities(): mixed
    {
        return $this->activities;
    }
}
