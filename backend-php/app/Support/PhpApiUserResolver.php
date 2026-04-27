<?php

namespace App\Support;

use App\Models\User;

class PhpApiUserResolver
{
    public function resolve(string $userId): ?User
    {
        $trimmed = trim($userId);
        if ($trimmed === '') {
            return null;
        }
        if (ctype_digit($trimmed)) {
            return User::find((int) $trimmed);
        }
        $email = $trimmed === 'driver123' ? 'driver123@vibedrive.test' : $trimmed;

        return User::where('email', $email)->first();
    }
}
