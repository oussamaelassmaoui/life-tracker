# Life Tracker — Enhanced build

## Included in this build
- Task validation uses optimistic React state: the checkmark/progress updates immediately without reloading the page.
- Task edits update the visible list immediately after the database save.
- Removing a task disables it instead of deleting the database row, so linked task logs remain intact.
- Pro Program export/import uses a compact JSON format. Import validates the file and offers Replace or Merge; Replace disables existing active tasks rather than deleting them. Existing task history is not intentionally deleted.
- History export produces UTF-8 CSV compatible with Excel.
- Prayer times are fetched from AlAdhan for the entered Moroccan city and the current date. An internet connection is required; verify local calculation settings before relying on the times.
- Responsive mobile layout retained.

## Important notes
- Push notifications still require valid VAPID environment variables, a working `/api/push/subscribe` endpoint, and deployment configuration. Browser permission alone does not guarantee reminders will arrive.
- The reminder schedule depends on the Vercel plan and `vercel.json`; do not assume minute-by-minute cron execution on Hobby.
- This package has not been confirmed with a successful production `next build` in this environment. Run `npm install` and `npm run build` before deployment.
- Database schema is included at `supabase/schema.sql`. Existing deployments should back up their database before changing schema or importing large programs.
