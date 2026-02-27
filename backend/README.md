# Backend Skeleton (Laravel-style)

This folder contains a clean business-oriented skeleton:
- migrations for wallet / prize / draw domain
- models and relationships
- service-layer transaction boundaries
- repository for weighted selection
- API route draft

To turn this into runnable Laravel app:
1. Install PHP + Composer
2. `composer install`
3. Create standard Laravel bootstrap files (or start from `laravel new` and copy these domain files)
4. Configure `.env`
5. Run migrations
