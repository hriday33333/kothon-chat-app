# Kothon: Messenger-er moto chat app (Next.js + Supabase)

Features: login/signup, 1-to-1 realtime chat, photo pathano, typing indicator, online status, seen/sent, message delete, unread count, mobile-first responsive UI, installable PWA.

## Setup (10 minute)

1. https://supabase.com e account khule **New project** banan.
2. **SQL Editor** > New query > `supabase/schema.sql` file-er puro text paste kore **Run**.
2b. Tarpor notun query-te `supabase/schema_v2.sql` Run korun.
3. **Authentication > Providers > Email** e giye **Confirm email** OFF korun (na korle signup-er por email confirm korte hobe).
4. **Project Settings > API** theke `Project URL` ar `anon public key` copy korun.
5. Project folder-e `.env.local` file banan (`.env.local.example` copy kore):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
6. Terminal:
   ```
   npm install
   npm run dev
   ```
   http://localhost:3000 e khulbe. Duijon duita alada browser/phone theke signup korun.

## Deploy (Vercel)

1. Code GitHub-e push korun.
2. vercel.com > New Project > repo import.
3. Environment Variables-e upore-r duita key boshan > Deploy.
4. Phone-e link khule browser menu theke **Add to Home Screen** korun.

## Notes

- Notun user-der jonno (3rd person ar na chaile) signup bondho korte: Supabase > Authentication > Sign In / Providers theke "Allow new users to sign up" OFF korun.
- Notification ekhon tab/app khola thakle kaj kore. App bondho thakleo notification chaile Web Push (VAPID + server) lagbe.
