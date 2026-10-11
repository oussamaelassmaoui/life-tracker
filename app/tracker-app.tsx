"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
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
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskTime, setTaskTime] = useState("09:00");
  const [taskCategory, setTaskCategory] = useState("Routine");
  const [taskRequired, setTaskRequired] = useState(true);
  const [taskNotify, setTaskNotify] = useState(false);
  const [prayerCity, setPrayerCity] = useState("Fes");
  const [prayerTimes, setPrayerTimes] = useState<Record<string, string> | null>(null);
  const [historyRange, setHistoryRange] = useState("month");
  const [busyTransfer, setBusyTransfer] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    async function fetchPrayerTimes() {
      try {
        const response = await fetch(`https://api.aladhan.com/v1/timingsByCity/${today}?city=${encodeURIComponent(prayerCity)}&country=Morocco&method=21`);
        if (!response.ok) throw new Error("Prayer times unavailable");
        const payload = await response.json();
        const t = payload?.data?.timings;
        if (!cancelled && t) setPrayerTimes({ Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha });
      } catch { if (!cancelled) setPrayerTimes(null); }
    }
    fetchPrayerTimes();
    return () => { cancelled = true; };
  }, [today, prayerCity]);

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
    setMessage("");
    const { data: existing, error: checkError } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    if (checkError) {
      setMessage(`Could not check existing tasks: ${checkError.message}`);
      return;
    }
    if (existing && existing.length > 0) {
      setMessage("Your program already exists. Use Add task to customize it.");
      return;
    }
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
    if (!user) return;
    setMessage("");
    const existing = logs.find((l) => l.task_id === task.id && l.date === today);
    const wasDone = existing?.status === "done";
    const previous = logs;
    const optimistic = wasDone
      ? logs.filter((l) => !(l.task_id === task.id && l.date === today))
      : [...logs.filter((l) => !(l.task_id === task.id && l.date === today)), { task_id: task.id, date: today, status: "done" as const, completed_at: new Date().toISOString() }];
    setLogs(optimistic);
    const result = wasDone
      ? await supabase.from("task_logs").delete().eq("task_id", task.id).eq("date", today).eq("user_id", user.id)
      : await supabase.from("task_logs").upsert({ user_id: user.id, task_id: task.id, date: today, status: "done", completed_at: new Date().toISOString() }, { onConflict: "user_id,task_id,date" });
    if (result.error) { setLogs(previous); setMessage(`Could not update task: ${result.error.message}`); }
  }

  function openNewTask() {
    setEditingTask(null);
    setTaskTitle("");
    setTaskTime("09:00");
    setTaskCategory("Routine");
    setTaskRequired(true);
    setTaskNotify(false);
    setShowTaskForm(true);
    setMessage("");
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskTime(task.time);
    setTaskCategory(task.category);
    setTaskRequired(task.required);
    setTaskNotify(task.notify);
    setShowTaskForm(true);
    setMessage("");
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const title = taskTitle.trim();
    if (!title) { setMessage("Write a name for the task."); return; }
    setSavingTask(true);
    setMessage("");
    const values = {
      user_id: user.id,
      weekday: day,
      time: taskTime,
      title,
      category: taskCategory.trim() || "Routine",
      required: taskRequired,
      enabled: true,
      notify: taskNotify,
    };
    const result = editingTask
      ? await supabase.from("tasks").update(values).eq("id", editingTask.id).eq("user_id", user.id)
      : await supabase.from("tasks").insert(values);
    setSavingTask(false);
    if (result.error) { setMessage(`Could not save task: ${result.error.message}`); return; }
    if (editingTask) setTasks((current) => current.map((t) => t.id === editingTask.id ? { ...t, ...values } : t).sort((a,b) => a.time.localeCompare(b.time)));
    else {
      const { data: inserted } = await supabase.from("tasks").select("*").eq("user_id", user.id).eq("weekday", day).eq("title", title).order("created_at", { ascending: false }).limit(1);
      if (inserted?.[0]) setTasks((current) => [...current, inserted[0] as Task].sort((a,b) => a.time.localeCompare(b.time)));
      else await loadData();
    }
    setShowTaskForm(false);
    setEditingTask(null);
    setMessage(editingTask ? "Task updated instantly." : "Task added.");
  }

  async function deleteTask(task: Task) {
    if (!user || !window.confirm(`Remove “${task.title}” from ${days[day]}? Its past history will be preserved.`)) return;
    setMessage("");
    setTasks((current) => current.filter((t) => t.id !== task.id));
    const { error } = await supabase.from("tasks").update({ enabled: false }).eq("id", task.id).eq("user_id", user.id);
    if (error) { setMessage(`Could not remove task: ${error.message}`); await loadData(); return; }
    setMessage("Task removed from program. History preserved.");
  }

  function downloadFile(filename: string, content: string, type = "application/json") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  async function exportProgram() {
    if (!user) return;
    setBusyTransfer(true);
    const { data, error } = await supabase.from("tasks").select("weekday,time,title,category,required,enabled,notify").eq("user_id", user.id).eq("enabled", true).order("weekday").order("time");
    setBusyTransfer(false);
    if (error) { setMessage(error.message); return; }
    downloadFile("life-tracker-program.json", JSON.stringify({ format: "life-tracker-program", version: 1, exportedAt: new Date().toISOString(), tasks: data ?? [] }, null, 2));
    setMessage("Program exported as JSON.");
  }

  async function importProgram(file?: File) {
    if (!file || !user) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.format !== "life-tracker-program" || !Array.isArray(parsed.tasks)) throw new Error("This is not a Life Tracker program JSON file.");
      const rows = parsed.tasks.map((t: any) => {
        if (!Number.isInteger(t.weekday) || t.weekday < 0 || t.weekday > 6 || typeof t.title !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)) throw new Error("The file contains an invalid task.");
        return { user_id: user.id, weekday: t.weekday, time: t.time, title: t.title.slice(0,100), category: String(t.category || "Routine"), required: Boolean(t.required), enabled: true, notify: Boolean(t.notify) };
      });
      const replace = window.confirm("Press OK to REPLACE the current program, or Cancel to MERGE the imported tasks. History will not be deleted.");
      setBusyTransfer(true);
      if (replace) {
        const { error: disableError } = await supabase.from("tasks").update({ enabled: false }).eq("user_id", user.id).eq("enabled", true);
        if (disableError) throw disableError;
      }
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
      await loadData(); setMessage(`Imported ${rows.length} tasks. Existing history was preserved.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not import program."); }
    finally { setBusyTransfer(false); }
  }

  async function exportHistory() {
    if (!user) return;
    const from = new Date();
    if (historyRange === "month") from.setMonth(from.getMonth() - 1);
    else if (historyRange === "year") from.setFullYear(from.getFullYear() - 1);
    else from.setFullYear(2000);
    const startDate = `${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,"0")}-${String(from.getDate()).padStart(2,"0")}`;
    const { data, error } = await supabase.from("task_logs").select("date,status,completed_at,task_id").eq("user_id", user.id).gte("date", startDate).order("date", { ascending: true });
    if (error) { setMessage(error.message); return; }
    const ids = [...new Set((data ?? []).map((l: any) => l.task_id))];
    const { data: taskData } = ids.length ? await supabase.from("tasks").select("id,title,category,weekday,time").in("id", ids) : { data: [] as any[] };
    const map = new Map((taskData ?? []).map((t: any) => [t.id, t]));
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [["date","task","category","weekday","time","status","completed_at"], ...(data ?? []).map((l: any) => { const t: any = map.get(l.task_id) || {}; return [l.date,t.title || "(task archived)",t.category,t.weekday == null ? "" : days[t.weekday],t.time,l.status,l.completed_at]; })].map(row => row.map(quote).join(",")).join("\r\n");
    downloadFile(`life-tracker-history-${historyRange}.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
    setMessage("History exported as CSV for Excel.");
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
        <button className="secondary" onClick={exportProgram} disabled={busyTransfer}>Export Pro Program</button>
        <label className="secondary file-import">Import Program<input type="file" accept="application/json,.json" hidden onChange={(e) => { void importProgram(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
        <label className="secondary">History <select value={historyRange} onChange={(e) => setHistoryRange(e.target.value)}><option value="day">Today onward</option><option value="month">Last month</option><option value="year">Last year</option><option value="all">All history</option></select></label>
        <button className="secondary" onClick={exportHistory}>Export History CSV</button>
        {message && <span className="message" role="status">{message}</span>}
      </section>

      <section className="panel prayer-panel">
        <div className="panel-head"><div><span className="eyebrow">PRAYER TIMES</span><h2>Prayer schedule · Morocco</h2></div><label>City <input value={prayerCity} onChange={(e) => setPrayerCity(e.target.value)} placeholder="Fes" /></label></div>
        {prayerTimes ? <div className="prayer-times">{Object.entries(prayerTimes).map(([name,time]) => <div key={name}><strong>{name}</strong><span>{time}</span></div>)}</div> : <p className="note-tip">Prayer times could not be loaded. Check your connection and city name.</p>}
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">DAILY PROGRAM</span><h2>{days[day]}</h2></div>
            <div className="panel-head-actions"><span className="badge">{score}%</span><button className="add-task-button" onClick={openNewTask}>+ Add task</button></div>
          </div>
          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty">No tasks yet. Add a task or create your 7-day program.</div>
            ) : tasks.map((task) => {
              const done = logs.some((l) => l.task_id === task.id && l.status === "done");
              return (
                <article className={`task-row ${done ? "done" : ""}`} key={task.id}>
                  <button className="task-complete" onClick={() => toggleTask(task)} aria-label={done ? `Unvalidate ${task.title}` : `Validate ${task.title}`} title={done ? "Undo validation" : "Validate task"}>
                    <span className="check">{done ? "✓" : ""}</span>
                  </button>
                  <div className="task-main">
                    <strong>{task.title}</strong>
                    <small>{task.time} · {task.category} · {task.required ? "Required" : "Optional"}</small>
                  </div>
                  {task.notify && <span className="task-notify" title="Reminder enabled">🔔</span>}
                  <div className="task-actions">
                    <button className="validate-button" onClick={() => toggleTask(task)}>{done ? "Undo" : "✓ Validate"}</button>
                    <button className="edit-button" onClick={() => openEditTask(task)}>Edit</button>
                    <button className="delete-button" onClick={() => deleteTask(task)}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
          {showTaskForm && (
            <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTaskForm(false); }}>
              <form className="task-form" onSubmit={saveTask}>
                <div className="form-heading"><h3>{editingTask ? "Edit task" : `Add task · ${days[day]}`}</h3><button type="button" className="close-button" onClick={() => setShowTaskForm(false)} aria-label="Close">×</button></div>
                <label>Task name<input autoFocus value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Read Quran" maxLength={100} required /></label>
                <div className="form-two-columns">
                  <label>Time<input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} required /></label>
                  <label>Category<select value={taskCategory} onChange={(e) => setTaskCategory(e.target.value)}><option>Prayer</option><option>Faith</option><option>Sport</option><option>Work</option><option>Food</option><option>Routine</option><option>Health</option><option>Personal</option></select></label>
                </div>
                <label className="form-check"><input type="checkbox" checked={taskRequired} onChange={(e) => setTaskRequired(e.target.checked)} /> Required for daily score</label>
                <label className="form-check"><input type="checkbox" checked={taskNotify} onChange={(e) => setTaskNotify(e.target.checked)} /> Reminder notification</label>
                <div className="form-actions"><button type="button" className="cancel-button" onClick={() => setShowTaskForm(false)}>Cancel</button><button type="submit" className="save-button" disabled={savingTask}>{savingTask ? "Saving…" : editingTask ? "Save changes" : "Add task"}</button></div>
              </form>
            </div>
          )}
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