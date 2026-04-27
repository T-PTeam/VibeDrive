<?php

return [
    'tools' => [
        [
            'type' => 'function',
            'function' => [
                'name' => 'play_music',
                'description' => 'Play a track or music by genre. Use when the user wants to listen to music.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'genre' => [
                            'type' => 'string',
                            'description' => 'Music genre (e.g. rock, pop, jazz, classical).',
                        ],
                        'track_name' => [
                            'type' => 'string',
                            'description' => 'Name of the track or song to play.',
                        ],
                    ],
                    'required' => ['genre', 'track_name'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'set_light_color',
                'description' => 'Set the interior or ambient light color using a hex code.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'hex_code' => [
                            'type' => 'string',
                            'description' => 'Hex color code (e.g. #FF5733 or #ffffff).',
                        ],
                    ],
                    'required' => ['hex_code'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'set_navigation_destination',
                'description' => 'Propose changing the navigation destination for the driver. Use when the user asks to change where they are going.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'dest_query' => [
                            'type' => 'string',
                            'description' => 'Destination as a human-readable place query (e.g. city, address, landmark).',
                        ],
                    ],
                    'required' => ['dest_query'],
                ],
            ],
        ],
    ],
];
