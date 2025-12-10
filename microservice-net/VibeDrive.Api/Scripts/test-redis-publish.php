<?php

$userId = $argv[1] ?? 'driver123';
$message = $argv[2] ?? 'Test message from PHP';

try {
    $redis = new Redis();
    $redis->connect('127.0.0.1', 6379);
    
    $messageData = [
        'userId' => $userId,
        'type' => 'test',
        'data' => $message,
        'timestamp' => date('c')
    ];
    
    $result = $redis->publish('driver_updates', json_encode($messageData));
    
    echo "Message published to $result subscriber(s)\n";
    echo "Message: " . json_encode($messageData, JSON_PRETTY_PRINT) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}

