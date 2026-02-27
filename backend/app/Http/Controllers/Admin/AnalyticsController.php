<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AdminAnalyticsService;
use Illuminate\Http\JsonResponse;

class AnalyticsController extends Controller
{
    public function __construct(private readonly AdminAnalyticsService $analyticsService)
    {
    }

    public function summary(): JsonResponse
    {
        return response()->json([
            'data' => $this->analyticsService->summary(),
        ]);
    }
}
