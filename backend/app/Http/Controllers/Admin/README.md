# Admin Middleware Note

Routes under `/admin` assume an `admin` middleware that validates `$request->user()->isAdmin()`.
Add middleware registration in your Laravel app bootstrap once integrated into runnable project base.
