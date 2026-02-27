<?php

return [
    'draw_cost' => (int) env('DRAW_COST', 10),
    'transaction_types' => [
        'debit_draw',
        'credit_reward',
        'adjustment',
    ],
];
