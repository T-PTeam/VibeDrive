<?php

namespace Database\Seeders;

use App\Models\ChatSession;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Seeder;

class ChatTestDataSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'test@driver.com'],
            [
                'name' => 'Test Driver',
                'password' => 'password',
            ]
        );

        $session = ChatSession::firstOrCreate(
            [
                'user_id' => $user->id,
                'title' => 'Sample chat',
            ],
            ['is_active' => true]
        );

        $messages = [
            ['role' => 'user', 'content' => 'Hello'],
            ['role' => 'assistant', 'content' => 'Hi friend!'],
            ['role' => 'user', 'content' => 'How are you?'],
            ['role' => 'assistant', 'content' => "I'm doing well, thanks. How can I help you today?"],
            ['role' => 'user', 'content' => 'Can you tell me about the app?'],
            ['role' => 'assistant', 'content' => 'Sure! This is VibeDrive — your driving companion. You can use it to log trips and get assistance.'],
            ['role' => 'user', 'content' => 'Sounds good.'],
            ['role' => 'assistant', 'content' => 'Great! If you have any other questions, just ask.'],
        ];

        foreach ($messages as $payload) {
            Message::firstOrCreate(
                [
                    'session_id' => $session->id,
                    'role' => $payload['role'],
                    'content' => $payload['content'],
                ],
                []
            );
        }
    }
}
