# Smart_lib

This is a Next.js app using Supabase for auth and user role handling.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file at the project root with:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

3. Run the app locally:

```bash
npm run dev
```

## Available scripts

- `npm run dev` — start the development server
- `npm run build` — build the production app
- `npm run start` — start the production server after build

## Notes

- `app/login/page.tsx` is the login/signup page
- `app/dashboard/page.tsx` is the protected dashboard page
- `utils/supabase/server.ts` creates the server-side Supabase client
- `utils/supabase/client.ts` creates the browser Supabase client
