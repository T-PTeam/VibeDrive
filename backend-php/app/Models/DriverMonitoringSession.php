<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverMonitoringSession extends Model
{
    protected $fillable = [
        'user_id',
        'user_identifier',
        'dest_city',
        'weight_kg',
        'volume_m3',
        'origin_city',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'weight_kg' => 'decimal:3',
            'volume_m3' => 'decimal:3',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
