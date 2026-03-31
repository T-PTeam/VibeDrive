<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class TestUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'driver123@vibedrive.test'],
            [
                'name' => 'Driver 123',
                'password' => 'driver123',
            ]
        );
    }
}
