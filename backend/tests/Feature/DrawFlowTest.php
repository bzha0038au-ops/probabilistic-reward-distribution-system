<?php

namespace Tests\Feature;

use Tests\TestCase;

class DrawFlowTest extends TestCase
{
    public function test_draw_requires_authentication(): void
    {
        $this->postJson('/api/draw')->assertStatus(401);
    }
}
