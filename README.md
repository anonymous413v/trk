# TaskFlow

Static TaskFlow app with Supabase Auth and Postgres. Vercel serves `/api/config` from the `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` environment variables. Copy `config.example.js` to `config.js` only for local static previews; it is ignored by Git. Never use a service-role key in the browser.

Deploy this folder to Vercel, set both environment variables for Production/Preview/Development, then add the Vercel URL to Supabase Auth's allowed redirect URLs and enable email/password sign-in. The database migration is already applied to the connected project.
