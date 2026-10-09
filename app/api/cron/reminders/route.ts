import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function cycleWeekday(date: Date, timezone: string) {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(date);
  const map: Record<string, number> = { Fri: 0, Sat: 1, Sun: 2, Mon: 3, Tue: 4, Wed: 5, Thu: 6 };
  return map[name];
}

function localHHMM(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "VAPID configuration missing" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = supabaseAdmin;
  const now = new Date();
  const timezone = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Africa/Casablanca";
  const weekday = cycleWeekday(now, timezone);
  const hhmm = localHHMM(now, timezone);
  const date = localDate(now, timezone);

  const { data: dueTasks, error: taskError } = await admin
    .from("tasks")
    .select("id,user_id,title,time,notify")
    .eq("weekday", weekday)
    .eq("time", hhmm)
    .eq("enabled", true)
    .eq("notify", true);

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
  if (!dueTasks?.length) return NextResponse.json({ sent: 0, checked: true, hhmm, weekday });

  let sent = 0;
  for (const task of dueTasks) {
    const { data: logs } = await admin
      .from("task_logs")
      .select("id")
      .eq("task_id", task.id)
      .eq("date", date)
      .eq("status", "done")
      .limit(1);

    if (logs?.length) continue;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", task.user_id);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "Life Tracker",
            body: `${task.time} — ${task.title}`,
            tag: `task-${task.id}-${date}`,
            url: "/",
          })
        );
        sent++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  }

  return NextResponse.json({ sent, checked: dueTasks.length, hhmm, weekday });
}