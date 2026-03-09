# CMS (Admin)

Admin console for the Prize Pool & Probability Engine System.

This app is a SvelteKit frontend that calls the shared backend API. It does not connect to backend storage directly.

## Stack

- SvelteKit + Vite
- Tailwind + DaisyUI
- Backend API in `apps/backend`

## Environment

Create `.env` from `.env.example` and set:

- `API_BASE_URL` (backend base URL, e.g. `http://localhost:4000`)
- `AUTH_SECRET` (must match backend `AUTH_SECRET`)

## Development

```bash
# from repo root
pnpm install
cd apps/admin
cp .env.example .env
pnpm dev
```

## Auth Flow

Admin login calls `POST /auth/admin/login` on the backend.
The backend sets the `reward_admin_session` cookie, which the CMS uses for all admin API calls.
