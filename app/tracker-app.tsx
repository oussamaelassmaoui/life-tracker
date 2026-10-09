"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

type Task = {
  id: string;
  user_id: string;
  weekday: number;
  time: string;
  title: string;
  category: string;
  required: boolean;
  enabled: boolean;
  notify: boolean;
};

type Log = {
  task_id: string;
  date: string;
  status: "done" | "missed";
  completed_at: string | null;
};

const days = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

const fallbackTasks = [
  ["Fajr", "05:30", "Prayer", true, true],
  ["Quran reading", "05:50", "Faith", true, true],
  ["Qiyam al-layl", "04:30", "Faith", false, true],
  ["Start day / light walk", "07:00", "Routine", true, true],
  ["Breakfast", "08:00", "Food", true, false],
  ["Job search / applications", "09:00", "Work", true, true],
  ["Dhuhr", "12:30", "Prayer", true, true],
  ["Freelance / project work", "14:00", "Work", true, true],
  ["Asr", "15:45", "Prayer", true, true],
  ["Maghrib", "18:30", "Prayer", true, true],
  ["Dinner", "19:00", "Food", true, false],
  ["Isha", "20:15", "Prayer", true, true],
  ["Wind down / daily review", "22:30", "Routine", true, false],
  ["Sleep", "23:00", "Routine", true, false],
] as const;

function weekdayIndex(date: Date) {
  // JS: Sunday=0. Our cycle: Friday=0 ... Thursday=6.
  return (date.getDay() + 2) % 7;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localDateKey() {
  const d = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function createSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function TrackerApp() {
  const supabase = useMemo(() => createSupabase(), []);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [sendingMagic, setSendingMagic] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [day, setDay] = useState(weekdayIndex(new Date()));
  const [notes, setNotes] = useState("");
  const [pushReady, setPushReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(true);
  const [message, setMessage] = useState("");

  const today = localDateKey();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, day]);

  useEffect(() => {
    const saved = localStorage.getItem("life-tracker-theme");
    if (saved) setDark(saved === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("life-tracker-theme", dark ? "dark" : "light");
  }, [dark]);

  async function loadData() {
    setLoading(true);
    const { data: taskData } = await supabase
      .from("tasks")
      .select("*")
      .eq("weekday", day)
      .eq("enabled", true)
      .order("time");

    const { data: logData } = await supabase
      .from("task_logs")
      .select("task_id,date,status,completed_at")
      .eq("date", today);

    const { data: dayData } = await supabase
      .from("daily_notes")
      .select("notes")
      .eq("date", today)
      .maybeSingle();

    setTasks((taskData as Task[]) ?? []);
    setLogs((logData as Log[]) ?? []);
    setNotes(dayData?.notes ?? "");
    setLoading(false);
  }

  async function seedWeek() {
    if (!user) return;
    const rows = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (const [title, time, category, required, notify] of fallbackTasks) {
        const shouldSport = [1, 3, 5].includes(weekday);
        if (title === "Start day / light walk" && shouldSport) {
          rows.push({ user_id: user.id, weekday, time, title: "Walking + running", category: "Sport", required: true, enabled: true, notify: true });
        } else if (title === "Start day / light walk") {
          rows.push({ user_id: user.id, weekday, time, title: "Recovery walk", category: "Sport", required: true, enabled: true, notify: false });
        } else {
          rows.push({ user_id: user.id, weekday, time, title, category, required, enabled: true, notify });
        }
      }
    }
    const { error } = await supabase.from("tasks").insert(rows);
    if (error) setMessage(error.message);
    else {
      setMessage("Weekly program created.");
      await loadData();
    }
  }

  async function toggleTask(task: Task) {
    const existing = logs.find((l) => l.task_id === task.id && l.date === today);
    if (existing?.status === "done") {
      await supabase.from("task_logs").delete().eq("task_id", task.id).eq("date", today);
    } else {
      await supabase.from("task_logs").upsert({
        user_id: user!.id,
        task_id: task.id,
        date: today,
        status: "done",
        completed_at: new Date().toISOString(),
      });
    }
    await loadData();
  }

  async function saveNotes(value: string) {
    setNotes(value);
    await supabase.from("daily_notes").upsert(
      { user_id: user!.id, date: today, notes: value },
      { onConflict: "user_id,date" }
    );
  }

  async function enablePush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMessage("Web Push is not supported by this browser.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Notifications were not allowed.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!res.ok) throw new Error("Could not save push subscription.");
      setPushReady(true);
      setMessage("Notifications enabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification setup failed.");
    }
  }

  async function signIn() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage("Enter your email first.");
      return;
    }

    setSendingMagic(true);
    setMagicSent(false);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        setMessage(`Login email failed: ${error.message}`);
        return;
      }

      setMagicSent(true);
      setMessage("Magic link sent. Check your inbox and Spam/Promotions.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send login email.");
    } finally {
      setSendingMagic(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTasks([]);
    setLogs([]);
  }

  if (loading) return <main className="center">Loading…</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">LT</div>
          <h1>Life Tracker</h1>
          <p>Routine, prayer, sport, job search and freelance — all in one place.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" type="email" />
          <button onClick={signIn} disabled={sendingMagic}>{sendingMagic ? "Sending…" : "Send magic login link"}</button>
          {magicSent && <div className="success">Check your email for the login link.</div>}
          {message && <div className="success">{message}</div>}
          <small>Your data is stored in your Supabase account.</small>
        </section>
      </main>
    );
  }

  const doneCount = tasks.filter((t) => logs.some((l) => l.task_id === t.id && l.status === "done")).length;
  const requiredCount = tasks.filter((t) => t.required).length;
  const requiredDone = tasks.filter((t) => t.required && logs.some((l) => l.task_id === t.id && l.status === "done")).length;
  const score = requiredCount ? Math.round((requiredDone / requiredCount) * 100) : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">PERSONAL LIFE SYSTEM</div>
          <h1>Life Tracker</h1>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => setDark(!dark)}>{dark ? "☀️" : "🌙"}</button>
          <button className="ghost" onClick={enablePush}>🔔 {pushReady ? "ON" : "NOTIFY"}</button>
          <button className="ghost" onClick={signOut}>Logout</button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-card">
          <span>Today</span>
          <strong>{days[day]}</strong>
          <p>{today}</p>
          <div className="progress"><i style={{ width: `${score}%` }} /></div>
          <small>{doneCount}/{tasks.length} tasks done · {score}% required score</small>
        </div>
        <div className="stat-card"><span>Current streak</span><strong>—</strong><small>Build it day by day</small></div>
        <div className="stat-card"><span>Sport days</span><strong>Sat · Mon · Wed</strong><small>Walking + running</small></div>
      </section>

      <nav className="day-tabs">
        {days.map((name, i) => (
          <button key={name} className={day === i ? "active" : ""} onClick={() => setDay(i)}>
            <span>{name.slice(0, 3)}</span>
            <b>{i + 1}</b>
          </button>
        ))}
      </nav>

      <section className="toolbar">
        <button onClick={seedWeek}>Create my 7-day program</button>
        <button className="secondary" onClick={enablePush}>Enable notifications</button>
        {message && <span className="message">{message}</span>}
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">DAILY PROGRAM</span><h2>{days[day]}</h2></div>
            <span className="badge">{score}%</span>
          </div>
          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty">No tasks yet. Click “Create my 7-day program”.</div>
            ) : tasks.map((task) => {
              const done = logs.some((l) => l.task_id === task.id && l.status === "done");
              return (
                <button className={`task ${done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task)}>
                  <span className="check">{done ? "✓" : ""}</span>
                  <span className="task-main">
                    <strong>{task.title}</strong>
                    <small>{task.time} · {task.category}{task.required ? " · Required" : " · Optional"}</small>
                  </span>
                  <span className="task-notify">{task.notify ? "🔔" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="panel notes">
          <div className="panel-head"><div><span className="eyebrow">DAILY REVIEW</span><h2>Notes</h2></div></div>
          <textarea value={notes} onChange={(e) => saveNotes(e.target.value)} placeholder="What went well? What needs fixing tomorrow?" />
          <div className="note-tip">Keep it simple: 3 lines are enough.</div>
        </aside>
      </section>

      <footer>
        <span>Life Tracker · Next.js + Supabase + Web Push</span>
        <span>Timezone: {process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Africa/Casablanca"}</span>
      </footer>
    </main>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}