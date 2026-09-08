# Smart_lib

This is a Next.js app using Supabase for auth and user role handling.

## Product scope

Smart Lib is an AI-powered digital library for academic resource discovery and temporary e-book access. Its core experience combines:

- **AI Library Assistant** for natural-language catalog, account, borrowing, and policy questions.
- **AI Research Helper** for finding resources and refining research topics with subject-focused searches.
- **Flexible digital lending** with tracked access periods, expiry, renewal, and borrowing history.
- **Intelligent resource management** for e-books and future research papers, theses, journals, and repository content.

Supporting capabilities include student profiles, saved resources, notifications, study notes, highlights, and administrator controls for users, resources, lending rules, and usage statistics.

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
