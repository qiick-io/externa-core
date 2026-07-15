<?php

namespace App\Http\Resources\Admin;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Spatie\Activitylog\Models\Activity;

/**
 * @mixin Activity
 */
class ActivityLogResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $properties = $this->properties?->toArray() ?? [];

        return [
            'id' => $this->id,
            'event' => $this->event,
            'description' => $this->description,
            'log_name' => $this->log_name,
            'created_at' => $this->created_at?->toIso8601String(),
            'causer' => $this->whenLoaded('causer', fn () => $this->causer instanceof User ? [
                'id' => $this->causer->id,
                'name' => $this->causer->name,
                'email' => $this->causer->email,
            ] : null),
            'subject' => $this->whenLoaded('subject', fn () => $this->subject !== null ? [
                'type' => class_basename($this->subject_type),
                'id' => $this->subject_id,
                'label' => $this->resolveSubjectLabel($this->subject),
            ] : null),
            'changes' => $this->attribute_changes?->toArray() ?? [],
            'properties' => [
                'ip' => $properties['ip'] ?? null,
                'user_agent' => $properties['user_agent'] ?? null,
            ],
        ];
    }

    protected function resolveSubjectLabel(Model $subject): string
    {
        if ($subject instanceof User) {
            return $subject->name;
        }

        if (isset($subject->name) && is_string($subject->name) && trim($subject->name) !== '') {
            return trim($subject->name);
        }

        return '#'.$subject->getKey();
    }
}
