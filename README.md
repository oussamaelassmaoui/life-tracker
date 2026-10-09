# Life Tracker — Next.js + Vercel

A personal Life Tracker built for Vercel with:

- Next.js App Router + TypeScript
- Supabase Auth + PostgreSQL
- PWA install support
- Web Push notifications
- Vercel Cron reminder worker
- 7-day cycle: Friday → Thursday
- Sport: Saturday / Monday / Wednesday
- Daily task validation
- Daily notes
- Dark/light mode
- Mobile-first UI

## 1. Create Supabase

Create a Supabase project, then open **SQL Editor** and run:

`supabase/schema.sql`

Enable Email OTP / Magic Link in Supabase Auth.

Add your deployed URL to Supabase Auth → URL Configuration → Redirect URLs.

## 2. Generate Web Push keys

Run:

```bash
npx web-push generate-vapid-keys
```

Copy the public/private keys into `.env.local` and Vercel Environment Variables.

## 3. Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Required values:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT
- CRON_SECRET
- NEXT_PUBLIC_DEFAULT_TIMEZONE (default: Africa/Casablanca)

Never expose the Supabase service-role key or VAPID private key with `NEXT_PUBLIC_`.

## 4. Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 5. Vercel

Push this folder to GitHub, then import the repository into Vercel.

Add all variables from `.env.local` to Vercel → Project Settings → Environment Variables.

Redeploy after saving environment variables.

Vercel reads `vercel.json` and registers the reminder cron automatically.

## Notifications

The app uses browser Web Push. After login, press **NOTIFY** and allow notifications.

The cron checks every minute for tasks whose local Morocco time matches the task time and sends a push notification to saved subscriptions. It skips tasks already marked Done.

Important: browser/OS notification permission is still controlled by the phone/browser. On iPhone, install the PWA to the Home Screen before expecting reliable Web Push behavior.

## Prayer times

The initial program uses editable placeholder times for prayers. Do not treat them as authoritative prayer times. For production use, replace them with a prayer-time provider/API or a manual schedule for your exact location and calculation method.

## Security

- Supabase RLS isolates user data.
- Server-only service role is used only by the cron/subscription server code.
- `CRON_SECRET` protects the cron endpoint when configured.
- `.env.example` contains placeholders only.

## Current scope

This is the complete deployable foundation. The next natural upgrade is an admin/settings screen for editing the weekly program, prayer-time source, notification lead time, streak/history dashboard, and richer analytics.


## Mobile responsive updates
- Responsive layouts for phones, tablets, and desktop.
- Larger touch targets for task actions and a bottom-sheet task form on small screens.
- Day tabs, cards, and notes adapt to narrow viewports to avoid horizontal overflow.
