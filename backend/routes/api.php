<?php

use App\Http\Controllers\Admin\AnalyticsController;
use App\Http\Controllers\Admin\PrizeAdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DrawController;
use App\Http\Controllers\WalletController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);
    Route::middleware('auth:sanctum')->post('logout', [AuthController::class, 'logout']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('wallet', [WalletController::class, 'show']);
    Route::get('wallet/history', [WalletController::class, 'history']);

    Route::post('draw', [DrawController::class, 'draw']);
});

Route::prefix('admin')->middleware(['auth:sanctum', 'admin'])->group(function () {
    Route::get('prizes', [PrizeAdminController::class, 'index']);
    Route::post('prizes', [PrizeAdminController::class, 'store']);
    Route::put('prizes/{prize}', [PrizeAdminController::class, 'update']);
    Route::patch('prizes/{prize}/toggle', [PrizeAdminController::class, 'toggle']);

    Route::get('analytics/summary', [AnalyticsController::class, 'summary']);
});
