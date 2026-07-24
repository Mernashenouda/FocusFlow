import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, ListChecks, ClipboardList, Timer, BookOpen, Languages, GraduationCap,
  BookMarked,
  NotebookPen, BarChart3, Settings as SettingsIcon, Sun, Moon, Plus, X, Check,
  Flame, Trophy, Search, Trash2, Pencil, ChevronRight, ChevronLeft, Droplet,
  ChevronUp, ChevronDown,
  Sparkles, Star, Clock, GripVertical, Download, Upload, RotateCcw, Bell,
  BellOff, Play, Pause, RefreshCw, Quote, TrendingUp, Award, Leaf, Mail,
  Cloud, CloudOff, LoaderCircle, LogOut, Menu, MailCheck, Target, Cross,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line,
} from "recharts";
import { supabase, cloudConfigured } from "./supabaseClient";

/* ============================================================================
   FocusFlow — a calm, minimal productivity app
   Design language: "Morning Garden" — soft ink/paper tones, a sage growth
   accent, Fraunces for display moments, Inter for UI, IBM Plex Mono for
   numbers & timers. Habits are framed as things you tend, not boxes to tick.
   ============================================================================ */

/* -------------------------------- Storage -------------------------------- */
// NOTE: Uses localStorage for persistence. See closing note to the user about
// artifact-preview limitations.
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — app still works in-memory for this session */
    }
  }, [key, value]);
  return [value, setValue];
}

/* ------------------------------ Cloud session ------------------------------ */
// Tracks the logged-in Supabase user (if cloud sync is configured at all).
function useSession() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  useEffect(() => {
    if (!cloudConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

/* -------------------------------- Cloud data ------------------------------- */
// Data lives in localStorage instantly (so the app never feels slow or blank),
// and syncs in the background to Supabase whenever a user is signed in, so the
// same data shows up on every device signed into that account.
function useCloudData(userId) {
  const [data, setData] = useLocalStorage("focusflow_v1", initialData);
  const [syncStatus, setSyncStatus] = useState("local"); // local | loading | synced | saving | error
  const loadedForUser = useRef(null);
  const skipNextSave = useRef(false);

  // Pull the latest remote copy whenever we learn who's signed in.
  useEffect(() => {
    if (!cloudConfigured || !userId) return;
    if (loadedForUser.current === userId) return;
    loadedForUser.current = userId;
    setSyncStatus("loading");
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("user_data")
          .select("data, updated_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (row?.data) {
          skipNextSave.current = true;
          setData(row.data);
        } else {
          // First time this account logs in: seed the cloud with what's local.
          await supabase.from("user_data").upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
        }
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Push local changes to the cloud (debounced) whenever data changes.
  useEffect(() => {
    if (!cloudConfigured || !userId) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSyncStatus("saving");
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("user_data")
          .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
        if (error) throw error;
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, userId]);

  return [data, setData, syncStatus];
}

/* --------------------------------- Utils ---------------------------------- */
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOfYear = (d = new Date()) => {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
};
const longDate = (d = new Date()) =>
  d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const last7Dates = () => {
  const arr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d);
  }
  return arr;
};
const uid = () => Math.random().toString(36).slice(2, 10);
// Consecutive days ending today (or yesterday, so a streak doesn't die the
// moment the clock ticks past midnight before you've logged today).
const computeCurrentStreak = (completedDates = []) => {
  const set = new Set(completedDates);
  let cursor = new Date();
  if (!set.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (set.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};
const STREAK_MESSAGES = [
  { min: 0, text: "Let's start today 🌱" },
  { min: 1, text: "Nice, you're rolling!" },
  { min: 3, text: "Building momentum 🔥" },
  { min: 7, text: "One week strong! 💪" },
  { min: 14, text: "Two weeks — real habit territory" },
  { min: 30, text: "Unstoppable! 🏆" },
];
const streakMessage = (streak) => {
  let msg = STREAK_MESSAGES[0].text;
  for (const s of STREAK_MESSAGES) if (streak >= s.min) msg = s.text;
  return msg;
};
const addDays = (date, delta) => {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
};

// Plays a short, pleasant two-tone chime when a focus/break interval ends.
// Built with the Web Audio API so no external sound file is needed.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const notes = [880, 1108.73]; // A5 then C#6 — a soft, clear little chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio not available — silently skip, the visual state still updates */
  }
}

/* ------------------------------- Constants -------------------------------- */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "bible", label: "Bible", icon: Cross },
  { id: "reading", label: "Reading", icon: BookOpen },
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "focus", label: "Focus", icon: Timer },
  { id: "english", label: "English", icon: Languages },
  { id: "skills", label: "Skills", icon: GraduationCap },
  { id: "trackers", label: "Trackers", icon: Target },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "stats", label: "Statistics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const DEFAULT_HABITS = [
  { id: "prayer", icon: "🙏", name: "Prayer" },
  { id: "bible", icon: "📖", name: "Bible Reading" },
  { id: "read10", icon: "📚", name: "Read 10 pages" },
  { id: "english", icon: "🇺🇸", name: "English (20 min)" },
  { id: "skill", icon: "💻", name: "Learn a new skill" },
  { id: "walk", icon: "🚶", name: "Walk / Exercise" },
  { id: "water", icon: "💧", name: "Drink Water" },
  { id: "ronos", icon: "🏢", name: "Ronos work" },
].map((h) => ({ ...h, notes: "", reminderTime: "", completedDates: [], bestStreak: 0 }));

const DEFAULT_SKILLS = [
  { id: uid(), name: "Cybersecurity", category: "Security", progress: 30, hours: 0, lessons: 0, notes: "" },
  { id: uid(), name: "Networking", category: "Infrastructure", progress: 15, hours: 0, lessons: 0, notes: "" },
  { id: uid(), name: "Linux", category: "Systems", progress: 40, hours: 0, lessons: 0, notes: "" },
  { id: uid(), name: "Programming", category: "Development", progress: 20, hours: 0, lessons: 0, notes: "" },
];

const QUOTES = [
  "Small steps, repeated daily, outrun big leaps taken rarely.",
  "Discipline is choosing what you want most over what you want now.",
  "Focus is a muscle. Every distraction resisted makes it stronger.",
  "You don't need more time, you need fewer distractions.",
  "Consistency is quieter than motivation, and it lasts longer.",
  "The phone can wait. The version of you that you're building can't.",
  "Progress hides in ordinary, unglamorous days.",
  "Protect your attention like it's the asset it is.",
  "One honest hour of focus beats a whole day of half-attention.",
  "Habits are votes for the person you're becoming.",
  "Silence the noise, and the work gets easier to hear.",
  "Rest is part of the routine, not a break from it.",
  "You are not behind. You are exactly on your own path.",
  "Every checkbox today is a brick in tomorrow's foundation.",
  "Do the boring part. It's usually the important part.",
  "Comparison steals focus. Curiosity keeps it.",
  "Your future is built in the minutes you decide not to scroll.",
  "Calm, steady effort compounds faster than it feels like it does.",
  "Show up for the small version of the goal, every day.",
  "The best streak is the one you don't break today.",
];

const ACCENTS = [
  { name: "Sage", value: "#7C9885" },
  { name: "Periwinkle", value: "#8E97FD" },
  { name: "Apricot", value: "#E58A5E" },
  { name: "Rose", value: "#D98E96" },
  { name: "Teal", value: "#5FA3A8" },
];

const CATEGORIES = ["Work", "Personal", "Learning", "Health", "Errands"];
const PRIORITIES = [
  { id: "high", label: "High", color: "#D9736A" },
  { id: "medium", label: "Medium", color: "#E0A85E" },
  { id: "low", label: "Low", color: "#7C9885" },
];

const ACHIEVEMENTS = [
  { id: "first-step", name: "First Step", desc: "Complete your first habit", icon: Leaf, check: (s) => s.totalHabitCompletions >= 1 },
  { id: "week-warrior", name: "Week Warrior", desc: "Reach a 7-day streak on any habit", icon: Flame, check: (s) => s.bestStreak >= 7 },
  { id: "month-master", name: "Month Master", desc: "Reach a 30-day streak", icon: Trophy, check: (s) => s.bestStreak >= 30 },
  { id: "bookworm", name: "Bookworm", desc: "Finish your first book", icon: BookOpen, check: (s) => s.booksFinished >= 1 },
  { id: "deep-focus", name: "Deep Focus", desc: "Complete 10 focus sessions", icon: Timer, check: (s) => s.focusSessions >= 10 },
  { id: "polyglot", name: "Polyglot", desc: "Log 300 English minutes", icon: Languages, check: (s) => s.englishMinutes >= 300 },
  { id: "reflective", name: "Reflective", desc: "Write 5 journal entries", icon: NotebookPen, check: (s) => s.journalEntries >= 5 },
  { id: "level-5", name: "Level 5", desc: "Reach level 5", icon: Star, check: (s) => s.level >= 5 },
];

const initialData = {
  userName: "Merna",
  theme: "light",
  accent: ACCENTS[0].value,
  notifications: true,
  hiddenSections: [], // NAV ids the user has chosen to hide from navigation
  xp: 0,
  habits: DEFAULT_HABITS,
  tasks: [],
  books: [],
  english: {}, // { 'YYYY-MM-DD': {vocab, minutes, grammar, listening, speaking, reading} }
  englishGoals: { grammar: 20, listening: 20, speaking: 20, reading: 20, vocab: 10 }, // daily target per skill (minutes, or words for vocab)
  skills: DEFAULT_SKILLS,
  customTrackers: [], // [{id, name, icon, unit, target, current, log:[{date, amount}], notes}]
  journal: {}, // { 'YYYY-MM-DD': {accomplished, distracted, grateful, feeling} }
  bible: {}, // { 'YYYY-MM-DD': {chapter, verse, reflection} }
  focusSessions: [], // { date, minutes }
};

/* ------------------------------ UI Primitives ------------------------------ */
const Card = ({ className = "", children, ...rest }) => (
  <div
    className={`rounded-3xl border backdrop-blur-xl shadow-[0_2px_20px_-4px_rgba(20,23,31,0.06)] ${className}`}
    style={{ background: "var(--card)", borderColor: "var(--border)" }}
    {...rest}
  >
    {children}
  </div>
);

const SectionTitle = ({ eyebrow, title, action }) => (
  <div className="flex items-end justify-between mb-5">
    <div>
      {eyebrow && (
        <div className="text-xs font-medium tracking-widest uppercase mb-1" style={{ color: "var(--accent)" }}>
          {eyebrow}
        </div>
      )}
      <h2 className="font-serif text-2xl md:text-3xl" style={{ color: "var(--text)" }}>
        {title}
      </h2>
    </div>
    {action}
  </div>
);

// Lets a view step backward/forward through days — used to backfill habits or
// study minutes for a day you forgot to log before midnight.
const DateNav = ({ date, setDate }) => {
  const isToday = dateKey(date) === dateKey();
  const label = isToday
    ? "Today"
    : dateKey(date) === dateKey(addDays(new Date(), -1))
    ? "Yesterday"
    : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={{ background: "var(--track)" }}>
      <button onClick={() => setDate(addDays(date, -1))} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--muted)" }}>
        <ChevronLeft size={15} />
      </button>
      <span className="text-xs font-medium px-2 min-w-[6.5rem] text-center" style={{ color: "var(--text)" }}>{label}</span>
      <button
        onClick={() => !isToday && setDate(addDays(date, 1))}
        disabled={isToday}
        className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30"
        style={{ color: "var(--muted)" }}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
};

const ProgressBar = ({ value, height = 8, color }) => (
  <div className="w-full rounded-full overflow-hidden" style={{ height, background: "var(--track)" }}>
    <motion.div
      className="h-full rounded-full"
      style={{ background: color || "var(--accent)" }}
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    />
  </div>
);

const IconBtn = ({ icon: Icon, onClick, title, active, className = "" }) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${className}`}
    style={{
      background: active ? "var(--accent-soft)" : "transparent",
      color: active ? "var(--accent)" : "var(--muted)",
    }}
  >
    <Icon size={17} />
  </button>
);

const Button = ({ children, onClick, variant = "primary", className = "", type = "button", disabled }) => {
  const base = "px-4 py-2.5 rounded-xl text-sm font-medium transition-all inline-flex items-center gap-2 justify-center disabled:opacity-40";
  const styles =
    variant === "primary"
      ? { background: "var(--accent)", color: "#fff" }
      : variant === "ghost"
      ? { background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }
      : { background: "var(--danger-soft)", color: "var(--danger)" };
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${className}`}
      style={styles}
    >
      {children}
    </motion.button>
  );
};

const Input = (props) => (
  <input
    {...props}
    className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-shadow focus:ring-2 ${props.className || ""}`}
    style={{ background: "var(--input)", color: "var(--text)", border: "1px solid var(--border)", ...props.style }}
  />
);

const TextArea = (props) => (
  <textarea
    {...props}
    className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none resize-none transition-shadow focus:ring-2 ${props.className || ""}`}
    style={{ background: "var(--input)", color: "var(--text)", border: "1px solid var(--border)", ...props.style }}
  />
);

const Select = (props) => (
  <select
    {...props}
    className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none ${props.className || ""}`}
    style={{ background: "var(--input)", color: "var(--text)", border: "1px solid var(--border)" }}
  >
    {props.children}
  </select>
);

const EmptyState = ({ icon: Icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      <Icon size={24} />
    </div>
    <div className="font-serif text-lg mb-1" style={{ color: "var(--text)" }}>{title}</div>
    <div className="text-sm max-w-xs" style={{ color: "var(--muted)" }}>{subtitle}</div>
  </div>
);

const Modal = ({ open, onClose, title, children }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          className="fixed inset-0 bg-black/30 z-40"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="fixed inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-md z-50 md:rounded-3xl rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
          style={{ background: "var(--card-solid)", border: "1px solid var(--border)" }}
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 260 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-xl" style={{ color: "var(--text)" }}>{title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--muted)" }}>
              <X size={18} />
            </button>
          </div>
          {children}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

/* ------------------------------- Confetti ---------------------------------- */
function Confetti({ fire }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.3,
        color: [ "#7C9885", "#8E97FD", "#E58A5E", "#D98E96", "#5FA3A8" ][i % 5],
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
      })),
    [fire]
  );
  return (
    <AnimatePresence>
      {fire && (
        <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
          {pieces.map((p) => (
            <motion.div
              key={p.id}
              initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0 }}
              animate={{ y: "100vh", opacity: [1, 1, 0], rotate: p.rotate }}
              transition={{ duration: 2.2 + Math.random(), delay: p.delay, ease: "easeIn" }}
              style={{ position: "absolute", width: p.size, height: p.size * 1.4, background: p.color, borderRadius: 2 }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  DASHBOARD                                 */
/* -------------------------------------------------------------------------- */
function Dashboard({ data, toggleHabit, xpInfo, achievements, goTo }) {
  const today = dateKey();
  const habits = data.habits;
  const doneToday = habits.filter((h) => h.completedDates.includes(today));
  const remaining = habits.filter((h) => !h.completedDates.includes(today));
  const pct = habits.length ? Math.round((doneToday.length / habits.length) * 100) : 0;
  const bestStreak = Math.max(0, ...habits.map((h) => h.bestStreak || 0));
  const quote = QUOTES[dayOfYear() % QUOTES.length];

  const weekData = last7Dates().map((d) => {
    const key = dateKey(d);
    const total = habits.length || 1;
    const done = habits.filter((h) => h.completedDates.includes(key)).length;
    return { day: d.toLocaleDateString(undefined, { weekday: "short" }), pct: Math.round((done / total) * 100) };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-sm mb-1" style={{ color: "var(--muted)" }}>{longDate()}</div>
          <h1 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--text)" }}>
            Welcome back, {data.userName || "friend"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs" style={{ color: "var(--muted)" }}>Level {xpInfo.level}</div>
            <div className="w-28"><ProgressBar value={xpInfo.pct} height={6} /></div>
          </div>
        </div>
      </div>

      {/* Quote */}
      <Card className="p-6 flex items-start gap-4">
        <Quote size={20} style={{ color: "var(--accent)" }} className="mt-1 shrink-0" />
        <p className="font-serif text-lg md:text-xl leading-snug" style={{ color: "var(--text)" }}>{quote}</p>
      </Card>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today's progress", value: `${pct}%`, icon: TrendingUp },
          { label: "Completed", value: `${doneToday.length}/${habits.length}`, icon: Check },
          { label: "Remaining", value: remaining.length, icon: ClipboardList },
          { label: "Best streak", value: `${bestStreak}d`, icon: Flame },
        ].map((s, i) => (
          <Card key={i} className="p-5">
            <s.icon size={16} style={{ color: "var(--accent)" }} className="mb-3" />
            <div className="font-mono text-2xl" style={{ color: "var(--text)" }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Weekly chart */}
        <Card className="p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="font-serif text-lg" style={{ color: "var(--text)" }}>This week</div>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Habit completion</span>
          </div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={weekData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: "var(--accent-soft)" }}
                  contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="pct" radius={[6, 6, 6, 6]} fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Today's list */}
        <Card className="p-6">
          <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Today</div>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {habits.map((h) => {
              const done = h.completedDates.includes(today);
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors"
                  style={{ background: done ? "var(--accent-soft)" : "transparent" }}
                >
                  <span className="text-lg">{h.icon}</span>
                  <span className="text-sm flex-1 truncate" style={{ color: "var(--text)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
                    {h.name}
                  </span>
                  {done && <Check size={15} style={{ color: "var(--accent)" }} />}
                </button>
              );
            })}
          </div>
          <button onClick={() => goTo("habits")} className="text-xs mt-3 font-medium" style={{ color: "var(--accent)" }}>
            Manage habits →
          </button>
        </Card>
      </div>

      {/* Achievements */}
      <Card className="p-6">
        <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Badges</div>
        <div className="flex flex-wrap gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = achievements.includes(a.id);
            return (
              <div
                key={a.id}
                title={a.desc}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{
                  background: unlocked ? "var(--accent-soft)" : "var(--track)",
                  color: unlocked ? "var(--accent)" : "var(--muted)",
                  opacity: unlocked ? 1 : 0.55,
                }}
              >
                <a.icon size={14} />
                <span className="font-medium">{a.name}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    HABITS                                  */
/* -------------------------------------------------------------------------- */
function HabitCard({ habit, onToggle, onUpdate, onDelete, viewDate, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(false);
  const checkDate = viewDate || dateKey();
  const done = habit.completedDates.includes(checkDate);
  const currentStreak = useMemo(() => computeCurrentStreak(habit.completedDates), [habit.completedDates]);
  const week = useMemo(() => last7Dates(), []);

  const handleToggle = () => {
    if (!done) {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
    }
    onToggle(habit.id, checkDate);
  };

  return (
    <Card className="p-5 relative overflow-visible">
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col -ml-1">
            <button onClick={onMoveUp} disabled={isFirst} className="w-5 h-4 flex items-center justify-center disabled:opacity-20" style={{ color: "var(--muted)" }}>
              <ChevronUp size={14} />
            </button>
            <button onClick={onMoveDown} disabled={isLast} className="w-5 h-4 flex items-center justify-center disabled:opacity-20" style={{ color: "var(--muted)" }}>
              <ChevronDown size={14} />
            </button>
          </div>
          <button
            onClick={handleToggle}
            className="relative w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 transition-colors"
            style={{ background: done ? "var(--accent)" : "var(--track)" }}
          >
            <span style={{ opacity: done ? 0 : 1 }}>{habit.icon}</span>
            <AnimatePresence>
              {done && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute inset-0 flex items-center justify-center text-white">
                  <Check size={20} />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {burst && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0.8 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </AnimatePresence>
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm truncate" style={{ color: "var(--text)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
              {habit.name}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {currentStreak > 0 && (
                <span
                  className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{
                    background: currentStreak >= 7 ? "var(--accent)" : "var(--accent-soft)",
                    color: currentStreak >= 7 ? "#fff" : "var(--accent)",
                  }}
                >
                  <Flame size={11} /> {currentStreak}
                </span>
              )}
              <button onClick={() => setOpen((o) => !o)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--muted)" }}>
                <Pencil size={13} />
              </button>
            </div>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--accent)" }}>
            {streakMessage(currentStreak)}
          </div>
          {habit.reminderTime && (
            <div className="flex items-center gap-1 text-xs mt-1" style={{ color: "var(--muted)" }}>
              <Clock size={11} /> {habit.reminderTime}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            {week.map((d) => {
              const k = dateKey(d);
              const isDone = habit.completedDates.includes(k);
              const isToday = k === dateKey();
              return (
                <div
                  key={k}
                  title={d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{
                    background: isDone ? "var(--accent)" : "var(--track)",
                    boxShadow: isToday ? "0 0 0 2px var(--accent-soft)" : "none",
                  }}
                >
                  {isDone && <Check size={9} className="text-white" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-4 mt-4 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex gap-2">
                <Input value={habit.icon} onChange={(e) => onUpdate(habit.id, { icon: e.target.value })} className="w-16 text-center" />
                <Input value={habit.name} onChange={(e) => onUpdate(habit.id, { name: e.target.value })} placeholder="Habit name" />
              </div>
              <TextArea
                rows={2} placeholder="Notes…" value={habit.notes}
                onChange={(e) => onUpdate(habit.id, { notes: e.target.value })}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs shrink-0" style={{ color: "var(--muted)" }}>Reminder</label>
                <Input type="time" value={habit.reminderTime} onChange={(e) => onUpdate(habit.id, { reminderTime: e.target.value })} />
              </div>
              <button onClick={() => onDelete(habit.id)} className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}>
                <Trash2 size={13} /> Delete habit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function HabitsView({ data, setData, toggleHabit }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "✨" });
  const [viewDate, setViewDate] = useState(new Date());
  const viewKey = dateKey(viewDate);

  const update = (id, patch) => {
    setData((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  };
  const remove = (id) => setData((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) }));
  const add = () => {
    if (!form.name.trim()) return;
    setData((d) => ({
      ...d,
      habits: [...d.habits, { id: uid(), name: form.name, icon: form.icon || "✨", notes: "", reminderTime: "", completedDates: [], bestStreak: 0, order: d.habits.length }],
    }));
    setForm({ name: "", icon: "✨" });
    setModal(false);
  };

  const orderedHabits = data.habits
    .map((h, i) => ({ ...h, order: h.order ?? i }))
    .sort((a, b) => a.order - b.order);

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= orderedHabits.length) return;
    setData((d) => {
      const list = orderedHabits.slice();
      [list[index], list[target]] = [list[target], list[index]];
      return { ...d, habits: list.map((h, i) => ({ ...h, order: i })) };
    });
  };

  const doneToday = data.habits.filter((h) => h.completedDates.includes(viewKey)).length;
  const totalHabits = data.habits.length;
  const dayPct = totalHabits ? Math.round((doneToday / totalHabits) * 100) : 0;
  const dayLine =
    totalHabits === 0
      ? null
      : dayPct === 100
      ? "All done — you showed up for yourself today 🎉"
      : dayPct >= 50
      ? "Over halfway there, keep going 🔥"
      : doneToday > 0
      ? "Good start — momentum is building"
      : "Nothing logged yet — even one small win counts";

  return (
    <div>
      <SectionTitle
        eyebrow="Daily practice"
        title="Habits"
        action={
          <div className="flex items-center gap-2">
            <DateNav date={viewDate} setDate={setViewDate} />
            <Button onClick={() => setModal(true)}><Plus size={16} /> New habit</Button>
          </div>
        }
      />
      {totalHabits > 0 && (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {doneToday}/{totalHabits} done {viewKey === dateKey() ? "today" : "that day"}
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>{dayPct}%</span>
          </div>
          <ProgressBar value={dayPct} color="var(--accent)" />
          {dayLine && <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>{dayLine}</div>}
        </Card>
      )}
      {viewKey !== dateKey() && (
        <div className="text-xs mb-4 px-1" style={{ color: "var(--muted)" }}>
          Editing {viewDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — tick anything you forgot to log that day.
        </div>
      )}
      {data.habits.length === 0 ? (
        <EmptyState icon={Leaf} title="No habits yet" subtitle="Add the practices you want to grow, one small tend at a time." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orderedHabits.map((h, i) => (
            <HabitCard
              key={h.id} habit={h} onToggle={toggleHabit} onUpdate={update} onDelete={remove} viewDate={viewKey}
              onMoveUp={() => move(i, -1)} onMoveDown={() => move(i, 1)}
              isFirst={i === 0} isLast={i === orderedHabits.length - 1}
            />
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="New habit">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="🌱" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="w-16 text-center" />
            <Input placeholder="Habit name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <Button className="w-full" onClick={add}>Add habit</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    TASKS                                   */
/* -------------------------------------------------------------------------- */
function TasksView({ data, setData }) {
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const empty = { title: "", priority: "medium", dueTime: "", category: CATEGORIES[0], notes: "" };
  const [form, setForm] = useState(empty);

  const filtered = data.tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (t) => { setEditing(t.id); setForm(t); setModal(true); };

  const save = () => {
    if (!form.title.trim()) return;
    if (editing) {
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === editing ? { ...t, ...form } : t)) }));
    } else {
      const order = data.tasks.length;
      setData((d) => ({ ...d, tasks: [...d.tasks, { ...form, id: uid(), completed: false, order }] }));
    }
    setModal(false);
  };
  const toggle = (id) => setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)) }));
  const remove = (id) => setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));

  const onDrop = (targetId) => {
    if (dragId === null || dragId === targetId) return;
    setData((d) => {
      const list = d.tasks.slice().sort((a, b) => a.order - b.order);
      const from = list.findIndex((t) => t.id === dragId);
      const to = list.findIndex((t) => t.id === targetId);
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...d, tasks: list.map((t, i) => ({ ...t, order: i })) };
    });
    setDragId(null);
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Today & beyond"
        title="Tasks"
        action={<Button onClick={openNew}><Plus size={16} /> New task</Button>}
      />
      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
        <Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing on the list" subtitle="Add a task to get it out of your head and onto the page." />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const pr = PRIORITIES.find((p) => p.id === t.priority);
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => setDragId(t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(t.id)}
              >
                <Card className="p-4 flex items-center gap-3">
                  <GripVertical size={15} className="cursor-grab shrink-0" style={{ color: "var(--muted)" }} />
                  <button
                    onClick={() => toggle(t.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2"
                    style={{ borderColor: t.completed ? "var(--accent)" : "var(--border)", background: t.completed ? "var(--accent)" : "transparent" }}
                  >
                    {t.completed && <Check size={13} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--text)", textDecoration: t.completed ? "line-through" : "none", opacity: t.completed ? 0.5 : 1 }}>
                      {t.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--track)", color: "var(--muted)" }}>{t.category}</span>
                      {t.dueTime && <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--muted)" }}><Clock size={10} />{t.dueTime}</span>}
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: `${pr.color}22`, color: pr.color }}>{pr.label}</span>
                    </div>
                  </div>
                  <button onClick={() => openEdit(t)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--muted)" }}><Pencil size={13} /></button>
                  <button onClick={() => remove(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--danger)" }}><Trash2 size={13} /></button>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit task" : "New task"}>
        <div className="space-y-3">
          <Input placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <Input type="time" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
          <TextArea rows={2} placeholder="Notes…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button className="w-full" onClick={save}>{editing ? "Save changes" : "Add task"}</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 FOCUS MODE                                 */
/* -------------------------------------------------------------------------- */
function FocusView({ addFocusSession, accent }) {
  const PRESETS = [
    { id: "25/5", work: 25, brk: 5 },
    { id: "50/10", work: 50, brk: 10 },
    { id: "custom", work: 30, brk: 5 },
  ];
  const [preset, setPreset] = useState(PRESETS[0]);
  const [customWork, setCustomWork] = useState(30);
  const [customBrk, setCustomBrk] = useState(5);
  const [phase, setPhase] = useState("work"); // work | break
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].work * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  const workMin = preset.id === "custom" ? customWork : preset.work;
  const brkMin = preset.id === "custom" ? customBrk : preset.brk;
  const totalSeconds = (phase === "work" ? workMin : brkMin) * 60;

  useEffect(() => {
    setSecondsLeft((phase === "work" ? workMin : brkMin) * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, workMin, brkMin]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (phase === "work") addFocusSession(workMin);
            playChime();
            const next = phase === "work" ? "break" : "work";
            setPhase(next);
            return (next === "work" ? workMin : brkMin) * 60;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, phase, workMin, brkMin, addFocusSession]);

  const mins = pad(Math.floor(secondsLeft / 60));
  const secs = pad(secondsLeft % 60);
  const progress = 1 - secondsLeft / totalSeconds;
  const R = 110;
  const circumference = 2 * Math.PI * R;

  return (
    <div>
      <SectionTitle eyebrow="Distraction-free" title="Focus Mode" />
      <Card className="p-8 md:p-14 flex flex-col items-center">
        <div className="flex gap-2 mb-10">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setRunning(false); setPhase("work"); setPreset(p); }}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: preset.id === p.id ? "var(--accent)" : "var(--track)", color: preset.id === p.id ? "#fff" : "var(--muted)" }}
            >
              {p.id === "custom" ? "Custom" : p.id}
            </button>
          ))}
        </div>

        {preset.id === "custom" && (
          <div className="flex gap-4 mb-8">
            <label className="text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
              Work <Input type="number" value={customWork} onChange={(e) => setCustomWork(+e.target.value || 1)} className="w-16" />
            </label>
            <label className="text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
              Break <Input type="number" value={customBrk} onChange={(e) => setCustomBrk(+e.target.value || 1)} className="w-16" />
            </label>
          </div>
        )}

        <div className="relative w-64 h-64 flex items-center justify-center mb-8">
          <motion.div
            animate={{ scale: running ? [1, 1.03, 1] : 1 }}
            transition={{ duration: 4, repeat: running ? Infinity : 0, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full"
            style={{ background: "var(--accent-soft)" }}
          />
          <svg width="256" height="256" className="-rotate-90 relative">
            <circle cx="128" cy="128" r={R} stroke="var(--track)" strokeWidth="10" fill="none" />
            <motion.circle
              cx="128" cy="128" r={R} stroke={accent} strokeWidth="10" fill="none" strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: circumference * (1 - progress) }}
              transition={{ duration: 0.6, ease: "linear" }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="font-mono text-5xl" style={{ color: "var(--text)" }}>{mins}:{secs}</span>
            <span className="text-xs uppercase tracking-widest mt-2" style={{ color: "var(--muted)" }}>
              {phase === "work" ? "Stay focused." : "Take a breath."}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => setRunning((r) => !r)}>
            {running ? <Pause size={16} /> : <Play size={16} />} {running ? "Pause" : "Start"}
          </Button>
          <Button variant="ghost" onClick={() => { setRunning(false); setPhase("work"); setSecondsLeft(workMin * 60); }}>
            <RefreshCw size={15} /> Reset
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               READING TRACKER                              */
/* -------------------------------------------------------------------------- */
const FINISH_LINES = [
  "Yaaay! Another book in the bag 🎉",
  "You did it! What a finish 🥳",
  "Book closed, mind opened 📖✨",
  "That's a wrap! Onto the next one 🎊",
];

function ReadingView({ data, setData, celebrate }) {
  const [modal, setModal] = useState(false);
  const [openBook, setOpenBook] = useState(null);
  const [form, setForm] = useState({ title: "", author: "", totalPages: 200 });
  const [justFinished, setJustFinished] = useState(null);
  const colors = ["#7C9885", "#8E97FD", "#E58A5E", "#D98E96", "#5FA3A8"];

  const add = () => {
    if (!form.title.trim()) return;
    setData((d) => ({
      ...d,
      books: [...d.books, { id: uid(), ...form, currentPage: 0, sessions: [], notes: "", quotes: [], completedAt: null }],
    }));
    setForm({ title: "", author: "", totalPages: 200 });
    setModal(false);
  };
  const update = (id, patch) => setData((d) => ({ ...d, books: d.books.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const remove = (id) => setData((d) => ({ ...d, books: d.books.filter((b) => b.id !== id) }));

  const logSession = (book, pages) => {
    if (!pages) return;
    const wasFinished = book.totalPages > 0 && book.currentPage >= book.totalPages;
    const newPage = Math.min(book.totalPages, book.currentPage + Number(pages));
    const justCompleted = !wasFinished && book.totalPages > 0 && newPage >= book.totalPages;

    setData((d) => ({
      ...d,
      books: d.books.map((b) =>
        b.id === book.id
          ? {
              ...b,
              currentPage: newPage,
              sessions: [...b.sessions, { date: dateKey(), pages: Number(pages) }],
              ...(justCompleted ? { completedAt: dateKey() } : {}),
            }
          : b
      ),
      xp: d.xp + (justCompleted ? 30 : 0),
    }));

    if (justCompleted) {
      celebrate?.();
      const line = FINISH_LINES[Math.floor(Math.random() * FINISH_LINES.length)];
      setJustFinished({ title: book.title, line });
      setTimeout(() => setJustFinished(null), 3400);
    }
  };

  return (
    <div>
      <SectionTitle eyebrow="Books" title="Reading Tracker" action={<Button onClick={() => setModal(true)}><Plus size={16} /> Add book</Button>} />

      <AnimatePresence>
        {justFinished && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="mb-4 px-4 py-3 rounded-2xl flex items-center gap-3"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Trophy size={18} className="shrink-0" />
            <div className="text-sm font-medium">
              {justFinished.line} — <span className="font-serif">“{justFinished.title}”</span> is done. +30 XP
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {data.books.length === 0 ? (
        <EmptyState icon={BookOpen} title="Your shelf is empty" subtitle="Add a book you're reading to start tracking pages and quotes." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.books.map((b, i) => {
            const finished = b.totalPages > 0 && b.currentPage >= b.totalPages;
            const pct = finished ? 100 : Math.round((b.currentPage / (b.totalPages || 1)) * 100);
            const isOpen = openBook === b.id;
            return (
              <Card key={b.id} className="p-5 relative overflow-visible" style={finished ? { borderColor: "var(--accent)" } : undefined}>
                {finished && (
                  <div
                    className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full flex items-center justify-center shadow-sm"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    title="Finished!"
                  >
                    <Check size={14} />
                  </div>
                )}
                <div className="flex gap-4">
                  <div
                    className="w-14 h-20 rounded-lg shrink-0 flex items-center justify-center text-white font-serif text-lg"
                    style={{ background: colors[i % colors.length], opacity: finished ? 0.55 : 1 }}
                  >
                    {b.title.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{b.title}</div>
                      {finished && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          Finished
                        </span>
                      )}
                    </div>
                    <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>{b.author || "Unknown author"}</div>
                    <ProgressBar value={pct} color={colors[i % colors.length]} />
                    <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                      {finished
                        ? `Completed${b.completedAt ? ` on ${b.completedAt}` : ""} · ${b.totalPages} pages`
                        : `${b.currentPage}/${b.totalPages} pages · ${pct}%`}
                    </div>
                  </div>
                </div>
                {!finished && (
                  <div className="flex items-center gap-2 mt-3">
                    <Input
                      type="number" placeholder="Pages read today" id={`pg-${b.id}`}
                      className="text-xs"
                      onKeyDown={(e) => { if (e.key === "Enter") { logSession(b, e.target.value); e.target.value = ""; } }}
                    />
                    <button
                      onClick={() => { const el = document.getElementById(`pg-${b.id}`); logSession(b, el.value); el.value = ""; }}
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent)", color: "#fff" }}
                    ><Plus size={15} /></button>
                    <button onClick={() => setOpenBook(isOpen ? null : b.id)} className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ color: "var(--muted)" }}>
                      <ChevronRight size={15} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                  </div>
                )}
                {finished && (
                  <div className="mt-3">
                    <button onClick={() => setOpenBook(isOpen ? null : b.id)} className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                      Notes & quotes <ChevronRight size={13} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                  </div>
                )}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="pt-4 mt-4 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
                        <TextArea rows={2} placeholder="Notes…" value={b.notes} onChange={(e) => update(b.id, { notes: e.target.value })} />
                        <TextArea
                          rows={2} placeholder="Favorite quote…"
                          onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { update(b.id, { quotes: [...b.quotes, e.target.value] }); e.target.value = ""; } }}
                        />
                        {b.quotes.length > 0 && (
                          <div className="space-y-1">
                            {b.quotes.map((q, qi) => (
                              <div key={qi} className="text-xs italic pl-3 border-l-2" style={{ color: "var(--muted)", borderColor: colors[i % colors.length] }}>"{q}"</div>
                            ))}
                          </div>
                        )}
                        <div className="text-[11px]" style={{ color: "var(--muted)" }}>{b.sessions.length} reading sessions logged</div>
                        <button onClick={() => remove(b.id)} className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}><Trash2 size={12} /> Remove book</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Add book">
        <div className="space-y-3">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
          <Input type="number" placeholder="Total pages" value={form.totalPages} onChange={(e) => setForm({ ...form, totalPages: +e.target.value })} />
          <Button className="w-full" onClick={add}>Add to shelf</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              ENGLISH LEARNING                              */
/* -------------------------------------------------------------------------- */
function EnglishView({ data, setData }) {
  const [viewDate, setViewDate] = useState(new Date());
  const viewKey = dateKey(viewDate);
  const entry = data.english[viewKey] || { vocab: 0, grammar: 0, listening: 0, speaking: 0, reading: 0 };
  const goals = data.englishGoals || { grammar: 20, listening: 20, speaking: 20, reading: 20, vocab: 10 };
  const [editingGoals, setEditingGoals] = useState(false);

  const set = (patch) => setData((d) => ({ ...d, english: { ...d.english, [viewKey]: { ...entry, ...patch } } }));
  const setGoal = (key, value) => setData((d) => ({ ...d, englishGoals: { ...(d.englishGoals || goals), [key]: Math.max(1, value) } }));

  const weekly = last7Dates().map((d) => {
    const key = dateKey(d);
    const e = data.english[key] || {};
    const minutes = (e.grammar || 0) + (e.listening || 0) + (e.speaking || 0) + (e.reading || 0);
    return { day: d.toLocaleDateString(undefined, { weekday: "short" }), minutes };
  });

  const fields = [
    { key: "grammar", label: "Grammar", icon: "📘", unit: "min" },
    { key: "listening", label: "Listening", icon: "🎧", unit: "min" },
    { key: "speaking", label: "Speaking", icon: "🗣️", unit: "min" },
    { key: "reading", label: "Reading", icon: "📖", unit: "min" },
    { key: "vocab", label: "Vocabulary", icon: "🧠", unit: "words" },
  ];
  const colors = { grammar: "#7C9885", listening: "#8E97FD", speaking: "#E58A5E", reading: "#D98E96", vocab: "#5FA3A8" };

  return (
    <div>
      <SectionTitle
        eyebrow="Language"
        title="English Learning"
        action={
          <div className="flex items-center gap-2">
            <DateNav date={viewDate} setDate={setViewDate} />
            <button onClick={() => setEditingGoals((v) => !v)} className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--accent)" }}>{editingGoals ? "Done" : "Edit goals"}</button>
          </div>
        }
      />
      {viewKey !== dateKey() && (
        <div className="text-xs mb-4 px-1" style={{ color: "var(--muted)" }}>
          Editing {viewDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-5">
          {fields.map((f) => {
            const done = entry[f.key] || 0;
            const goal = goals[f.key] || (f.unit === "words" ? 10 : 20);
            const pct = Math.round((done / goal) * 100);
            const remaining = Math.max(0, goal - done);
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                    <span>{f.icon}</span> {f.label}
                  </span>
                  {editingGoals ? (
                    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                      goal
                      <Input type="number" value={goal} onChange={(e) => setGoal(f.key, +e.target.value)} className="w-16 py-1" />
                      {f.unit}
                    </div>
                  ) : (
                    <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>{done}/{goal} {f.unit}</span>
                  )}
                </div>
                <ProgressBar value={pct} color={colors[f.key]} />
                {!editingGoals && (
                  <div className="flex items-center justify-between mt-1.5">
                    <Input
                      type="number" value={done} onChange={(e) => set({ [f.key]: +e.target.value })}
                      className="w-24 py-1 text-xs" placeholder={f.unit}
                    />
                    <span className="text-[11px]" style={{ color: remaining === 0 ? "var(--accent)" : "var(--muted)" }}>
                      {remaining === 0 ? "Goal reached 🎉" : `${remaining} ${f.unit} left`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Card className="p-6">
          <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Weekly minutes</div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={weekly}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="minutes" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                SKILL TRACKER                               */
/* -------------------------------------------------------------------------- */
function SkillsView({ data, setData }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", category: "" });

  const update = (id, patch) => setData((d) => ({ ...d, skills: d.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const remove = (id) => setData((d) => ({ ...d, skills: d.skills.filter((s) => s.id !== id) }));
  const add = () => {
    if (!form.name.trim()) return;
    setData((d) => ({ ...d, skills: [...d.skills, { id: uid(), name: form.name, category: form.category || "General", progress: 0, hours: 0, lessons: 0, notes: "" }] }));
    setForm({ name: "", category: "" });
    setModal(false);
  };

  return (
    <div>
      <SectionTitle eyebrow="Learning paths" title="Skill Tracker" action={<Button onClick={() => setModal(true)}><Plus size={16} /> New path</Button>} />
      <div className="grid sm:grid-cols-2 gap-4">
        {data.skills.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium text-sm" style={{ color: "var(--text)" }}>{s.name}</div>
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>{s.category}</div>
              </div>
              <button onClick={() => remove(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--danger)" }}><Trash2 size={13} /></button>
            </div>
            <ProgressBar value={s.progress} />
            <div className="flex items-center justify-between mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
              <span>{s.progress}% complete</span>
              <span>{s.hours}h · {s.lessons} lessons</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div>
                <label className="text-[10px]" style={{ color: "var(--muted)" }}>Progress %</label>
                <Input type="number" value={s.progress} onChange={(e) => update(s.id, { progress: Math.min(100, +e.target.value) })} />
              </div>
              <div>
                <label className="text-[10px]" style={{ color: "var(--muted)" }}>Hours</label>
                <Input type="number" value={s.hours} onChange={(e) => update(s.id, { hours: +e.target.value })} />
              </div>
              <div>
                <label className="text-[10px]" style={{ color: "var(--muted)" }}>Lessons</label>
                <Input type="number" value={s.lessons} onChange={(e) => update(s.id, { lessons: +e.target.value })} />
              </div>
            </div>
            <TextArea rows={2} placeholder="Notes…" className="mt-3" value={s.notes} onChange={(e) => update(s.id, { notes: e.target.value })} />
          </Card>
        ))}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="New learning path">
        <div className="space-y-3">
          <Input placeholder="Skill name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Button className="w-full" onClick={add}>Add path</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              CUSTOM TRACKERS                               */
/* -------------------------------------------------------------------------- */
function TrackersView({ data, setData }) {
  const [modal, setModal] = useState(null); // null | "new" | tracker id being logged
  const [logAmount, setLogAmount] = useState("");
  const empty = { name: "", icon: "🎯", unit: "", target: 10 };
  const [form, setForm] = useState(empty);
  const colors = ["#7C9885", "#8E97FD", "#E58A5E", "#D98E96", "#5FA3A8"];

  const trackers = data.customTrackers || [];

  const add = () => {
    if (!form.name.trim()) return;
    setData((d) => ({
      ...d,
      customTrackers: [
        ...(d.customTrackers || []),
        { id: uid(), name: form.name, icon: form.icon || "🎯", unit: form.unit || "units", target: Number(form.target) || 10, current: 0, log: [], notes: "" },
      ],
    }));
    setForm(empty);
    setModal(null);
  };

  const update = (id, patch) => setData((d) => ({ ...d, customTrackers: d.customTrackers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const remove = (id) => setData((d) => ({ ...d, customTrackers: d.customTrackers.filter((t) => t.id !== id) }));

  const logProgress = (tracker) => {
    const amount = Number(logAmount);
    if (!amount) return;
    update(tracker.id, {
      current: tracker.current + amount,
      log: [...tracker.log, { date: dateKey(), amount }],
    });
    setLogAmount("");
    setModal(null);
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Whatever you want to grow"
        title="Trackers"
        action={<Button onClick={() => setModal("new")}><Plus size={16} /> New tracker</Button>}
      />
      {trackers.length === 0 ? (
        <EmptyState icon={Target} title="Build your own tracker" subtitle="Give it a name and a target — steps walked, cups of coffee skipped, pages memorized, anything." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trackers.map((t, i) => {
            const pct = Math.round((t.current / (t.target || 1)) * 100);
            const color = colors[i % colors.length];
            return (
              <Card key={t.id} className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{t.icon}</span>
                    <div className="font-medium text-sm" style={{ color: "var(--text)" }}>{t.name}</div>
                  </div>
                  <button onClick={() => remove(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--danger)" }}><Trash2 size={13} /></button>
                </div>
                <ProgressBar value={pct} color={color} />
                <div className="flex items-center justify-between mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
                  <span>{t.current}/{t.target} {t.unit}</span>
                  <span>{pct}%</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Input
                    type="number" placeholder={`Add ${t.unit}…`} value={modal === t.id ? logAmount : ""}
                    onFocus={() => setModal(t.id)}
                    onChange={(e) => { setModal(t.id); setLogAmount(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") logProgress(t); }}
                    className="text-xs"
                  />
                  <button onClick={() => logProgress(t)} className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color, color: "#fff" }}>
                    <Plus size={15} />
                  </button>
                </div>
                <TextArea rows={2} placeholder="Notes…" className="mt-3 text-xs" value={t.notes} onChange={(e) => update(t.id, { notes: e.target.value })} />
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal === "new"} onClose={() => setModal(null)} title="New tracker">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="🎯" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="w-16 text-center" />
            <Input placeholder="Tracker name (e.g. Push-ups)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Unit (e.g. reps, cups)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Input type="number" placeholder="Target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </div>
          <Button className="w-full" onClick={add}>Create tracker</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   JOURNAL                                  */
/* -------------------------------------------------------------------------- */
function JournalView({ data, setData }) {
  const today = dateKey();
  const entry = data.journal[today] || { accomplished: "", distracted: "", grateful: "", feeling: "" };
  const set = (patch) => setData((d) => ({ ...d, journal: { ...d.journal, [today]: { ...entry, ...patch } } }));

  const questions = [
    { key: "accomplished", label: "What did I accomplish today?" },
    { key: "distracted", label: "What distracted me?" },
    { key: "grateful", label: "What am I grateful for?" },
    { key: "feeling", label: "How do I feel?" },
  ];

  const pastEntries = Object.entries(data.journal)
    .filter(([k]) => k !== today)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 10);

  return (
    <div>
      <SectionTitle eyebrow="Daily reflection" title="Journal" />
      <Card className="p-6 space-y-4 mb-6">
        <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{longDate()}</div>
        {questions.map((q) => (
          <div key={q.key}>
            <label className="text-xs" style={{ color: "var(--muted)" }}>{q.label}</label>
            <TextArea rows={2} value={entry[q.key]} onChange={(e) => set({ [q.key]: e.target.value })} />
          </div>
        ))}
      </Card>

      {pastEntries.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>Past reflections</div>
          <div className="space-y-2">
            {pastEntries.map(([k, e]) => (
              <Card key={k} className="p-4">
                <div className="text-xs font-mono mb-1" style={{ color: "var(--accent)" }}>{k}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{e.accomplished || "—"}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    BIBLE                                   */
/* -------------------------------------------------------------------------- */
function BibleView({ data, setData }) {
  const [viewDate, setViewDate] = useState(new Date());
  const viewKey = dateKey(viewDate);
  const bible = data.bible || {};
  const entry = bible[viewKey] || { chapter: "", verse: "", reflection: "" };
  const set = (patch) => setData((d) => ({ ...d, bible: { ...(d.bible || {}), [viewKey]: { ...entry, ...patch } } }));

  const fields = [
    { key: "chapter", label: "What did I read today?", placeholder: "e.g. Psalm 23", rows: 1 },
    { key: "verse", label: "Which verse spoke to me?", placeholder: "Write the verse…", rows: 2 },
    { key: "reflection", label: "My reflection", placeholder: "What is God saying to me through it?", rows: 3 },
  ];

  const pastEntries = Object.entries(bible)
    .filter(([k]) => k !== viewKey && (bible[k].chapter || bible[k].verse || bible[k].reflection))
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14);

  return (
    <div>
      <SectionTitle
        eyebrow="Scripture"
        title="Bible Reading"
        action={<DateNav date={viewDate} setDate={setViewDate} />}
      />
      {viewKey !== dateKey() && (
        <div className="text-xs mb-4 px-1" style={{ color: "var(--muted)" }}>
          Editing {viewDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.
        </div>
      )}
      <Card className="p-6 space-y-4 mb-6">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-xs" style={{ color: "var(--muted)" }}>{f.label}</label>
            <TextArea rows={f.rows} placeholder={f.placeholder} value={entry[f.key] || ""} onChange={(e) => set({ [f.key]: e.target.value })} />
          </div>
        ))}
      </Card>

      {pastEntries.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>Past readings</div>
          <div className="space-y-2">
            {pastEntries.map(([k, e]) => (
              <Card key={k} className="p-4">
                <div className="text-xs font-mono mb-1" style={{ color: "var(--accent)" }}>{k}{e.chapter ? ` — ${e.chapter}` : ""}</div>
                {e.verse && (
                  <div className="text-xs italic pl-3 border-l-2" style={{ color: "var(--muted)", borderColor: "var(--accent)" }}>"{e.verse}"</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 STATISTICS                                 */
/* -------------------------------------------------------------------------- */
function StatsView({ data }) {
  const [range, setRange] = useState("weekly");
  const days = range === "weekly" ? 7 : 30;
  const dateRange = Array.from({ length: days }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d;
  });

  const habitData = dateRange.map((d) => {
    const key = dateKey(d);
    const total = data.habits.length || 1;
    const done = data.habits.filter((h) => h.completedDates.includes(key)).length;
    return { day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), pct: Math.round((done / total) * 100) };
  });

  const focusData = dateRange.map((d) => {
    const key = dateKey(d);
    const mins = data.focusSessions.filter((s) => s.date === key).reduce((a, s) => a + s.minutes, 0);
    return { day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), minutes: mins };
  });

  const readingData = dateRange.map((d) => {
    const key = dateKey(d);
    const pages = data.books.reduce((sum, b) => sum + b.sessions.filter((s) => s.date === key).reduce((a, s) => a + s.pages, 0), 0);
    return { day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), pages };
  });

  // heatmap — last 84 days
  const heatDays = Array.from({ length: 84 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (83 - i));
    const key = dateKey(d);
    const total = data.habits.length || 1;
    const done = data.habits.filter((h) => h.completedDates.includes(key)).length;
    return { key, pct: done / total };
  });

  const streaks = data.habits.map((h) => ({ name: h.name, streak: h.bestStreak || 0 })).sort((a, b) => b.streak - a.streak);

  return (
    <div>
      <SectionTitle
        eyebrow="Overview"
        title="Statistics"
        action={
          <div className="flex gap-2">
            {["weekly", "monthly"].map((r) => (
              <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize" style={{ background: range === r ? "var(--accent)" : "var(--track)", color: range === r ? "#fff" : "var(--muted)" }}>
                {r}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Habit completion</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={habitData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(days / 7)} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="pct" radius={[4, 4, 4, 4]} fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Focus minutes</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={focusData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(days / 7)} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="minutes" stroke="#8E97FD" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Reading pages</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={readingData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(days / 7)} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "var(--card-solid)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="pages" radius={[4, 4, 4, 4]} fill="#E58A5E" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Streak leaderboard</div>
          <div className="space-y-2">
            {streaks.slice(0, 6).map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="text-xs w-28 truncate" style={{ color: "var(--text)" }}>{s.name}</span>
                <div className="flex-1"><ProgressBar value={Math.min(100, s.streak * 3)} height={6} /></div>
                <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>{s.streak}d</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="font-serif text-lg mb-4" style={{ color: "var(--text)" }}>Consistency heatmap</div>
        <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2">
          {heatDays.map((d) => (
            <div
              key={d.key}
              title={`${d.key} — ${Math.round(d.pct * 100)}%`}
              className="w-3 h-3 rounded-sm"
              style={{ background: d.pct === 0 ? "var(--track)" : "var(--accent)", opacity: d.pct === 0 ? 1 : 0.25 + d.pct * 0.75 }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   SETTINGS                                 */
/* -------------------------------------------------------------------------- */
function SettingsView({ data, setData, cloudConfigured, userEmail, onSignOut, syncStatus }) {
  const fileRef = useRef(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `focusflow-backup-${dateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setData(parsed);
      } catch {
        alert("That file couldn't be read as FocusFlow data.");
      }
    };
    reader.readAsText(file);
  };

  const reset = () => {
    if (window.confirm("This clears all habits, tasks, books, and progress. Continue?")) {
      setData(initialData);
    }
  };

  return (
    <div>
      <SectionTitle eyebrow="Preferences" title="Settings" />
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-5">
          <div>
            <label className="text-xs" style={{ color: "var(--muted)" }}>Your name</label>
            <Input value={data.userName} onChange={(e) => setData({ ...data, userName: e.target.value })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Theme</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Light or dark mode</div>
            </div>
            <button
              onClick={() => setData({ ...data, theme: data.theme === "light" ? "dark" : "light" })}
              className="w-14 h-8 rounded-full flex items-center px-1 transition-colors"
              style={{ background: "var(--accent)", justifyContent: data.theme === "dark" ? "flex-end" : "flex-start" }}
            >
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                {data.theme === "dark" ? <Moon size={13} color="#232733" /> : <Sun size={13} color="#232733" />}
              </div>
            </button>
          </div>
          <div>
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>Accent color</div>
            <div className="flex gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setData({ ...data, accent: a.value })}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: a.value, boxShadow: data.accent === a.value ? "0 0 0 3px var(--bg), 0 0 0 5px var(--text)" : "none" }}
                >
                  {data.accent === a.value && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Reminder notifications</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Show habit reminder cues</div>
            </div>
            <button onClick={() => setData({ ...data, notifications: !data.notifications })} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--track)", color: data.notifications ? "var(--accent)" : "var(--muted)" }}>
              {data.notifications ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Visible sections</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>Hide sections you don't use — your data stays safe, you can bring them back anytime.</div>
          </div>
          <div className="space-y-1">
            {NAV.filter((n) => n.id !== "dashboard" && n.id !== "settings").map((n) => {
              const hidden = (data.hiddenSections || []).includes(n.id);
              return (
                <div key={n.id} className="flex items-center justify-between px-1 py-1.5">
                  <div className="flex items-center gap-2 text-sm" style={{ color: hidden ? "var(--muted)" : "var(--text)" }}>
                    <n.icon size={15} />
                    {n.label}
                  </div>
                  <button
                    onClick={() =>
                      setData((d) => {
                        const current = d.hiddenSections || [];
                        return { ...d, hiddenSections: hidden ? current.filter((x) => x !== n.id) : [...current, n.id] };
                      })
                    }
                    className="w-11 h-6 rounded-full flex items-center px-1 transition-colors"
                    style={{ background: hidden ? "var(--track)" : "var(--accent)", justifyContent: hidden ? "flex-start" : "flex-end" }}
                  >
                    <div className="w-4 h-4 rounded-full bg-white" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <Card className="p-6 space-y-4">
          <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Data</div>
          <Button variant="ghost" className="w-full" onClick={exportData}><Download size={15} /> Export data (.json)</Button>
          <Button variant="ghost" className="w-full" onClick={() => fileRef.current?.click()}><Upload size={15} /> Import data</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importData} />
          <Button variant="danger" className="w-full" onClick={reset}><RotateCcw size={15} /> Reset all data</Button>
          <div className="pt-3 mt-3 border-t text-xs leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Keyboard shortcuts</div>
            Press <b>1–9</b> to jump between sections.
          </div>
        </Card>

        <Card className="p-6 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Cloud sync</div>
            {cloudConfigured && <SyncBadge status={syncStatus} />}
          </div>
          {cloudConfigured ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "var(--track)" }}>
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                  <Cloud size={15} style={{ color: "var(--accent)" }} /> {userEmail}
                </div>
                <button onClick={onSignOut} className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--danger)" }}>
                  <LogOut size={13} /> Sign out
                </button>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                Your data syncs automatically to every device signed in with this email.
              </p>
            </>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              Cloud sync isn't set up yet — data is saved on this device only. Add your Supabase keys as environment variables to enable sync across devices.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                AUTH SCREEN                                 */
/* -------------------------------------------------------------------------- */
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const themeVars = { "--bg": "#F6F7FB", "--card": "rgba(255,255,255,0.8)", "--card-solid": "#FFFFFF", "--text": "#232733", "--muted": "#6B7280", "--border": "rgba(35,39,51,0.08)", "--track": "rgba(35,39,51,0.06)", "--input": "rgba(35,39,51,0.03)", "--accent": "#7C9885", "--accent-soft": "#7C988522", "--danger": "#C7635C", "--danger-soft": "rgba(199,99,92,0.10)" };

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div style={{ ...themeVars, background: "var(--bg)", minHeight: "100vh" }} className="flex items-center justify-center p-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .font-serif { font-family: 'Fraunces', serif; }
      `}</style>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <Leaf size={18} className="text-white" />
          </div>
          <span className="font-serif text-xl" style={{ color: "var(--text)" }}>FocusFlow</span>
        </div>
        <Card className="p-7">
          {!sent ? (
            <>
              <h1 className="font-serif text-2xl mb-1 text-center" style={{ color: "var(--text)" }}>Welcome</h1>
              <p className="text-sm text-center mb-6" style={{ color: "var(--muted)" }}>
                Sign in with your email to keep your habits, tasks, and progress in sync across every device.
              </p>
              <form onSubmit={submit} className="space-y-3">
                <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}
                  {loading ? "Sending…" : "Send me a sign-in link"}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <MailCheck size={22} />
              </div>
              <h2 className="font-serif text-xl mb-2" style={{ color: "var(--text)" }}>Check your inbox</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                We sent a sign-in link to <b>{email}</b>. Open it on this device (or any device) to sign in — same email, same data, everywhere.
              </p>
              <button onClick={() => setSent(false)} className="text-xs mt-4 font-medium" style={{ color: "var(--accent)" }}>Use a different email</button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                SYNC BADGE                                  */
/* -------------------------------------------------------------------------- */
function SyncBadge({ status }) {
  const map = {
    local: { icon: CloudOff, label: "Local only", color: "var(--muted)" },
    loading: { icon: LoaderCircle, label: "Loading…", color: "var(--accent)", spin: true },
    saving: { icon: LoaderCircle, label: "Saving…", color: "var(--accent)", spin: true },
    synced: { icon: Cloud, label: "Synced", color: "var(--accent)" },
    error: { icon: CloudOff, label: "Offline", color: "var(--danger)" },
  };
  const s = map[status] || map.local;
  return (
    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: s.color }}>
      <s.icon size={12} className={s.spin ? "animate-spin" : ""} />
      {s.label}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                     APP                                    */
/* -------------------------------------------------------------------------- */
export default function App() {
  const session = useSession();

  if (cloudConfigured && session === undefined) {
    return (
      <div style={{ background: "#F6F7FB", minHeight: "100vh" }} className="flex items-center justify-center">
        <LoaderCircle size={24} className="animate-spin" style={{ color: "#7C9885" }} />
      </div>
    );
  }
  if (cloudConfigured && !session) {
    return <AuthScreen />;
  }
  return <AppShell userId={session?.user?.id || null} userEmail={session?.user?.email || ""} />;
}

function AppShell({ userId, userEmail }) {
  const [data, setData, syncStatus] = useCloudData(userId);
  const [tab, setTab] = useState("dashboard");
  useEffect(() => {
    if ((data.hiddenSections || []).includes(tab)) setTab("dashboard");
  }, [data.hiddenSections, tab]);
  const [confetti, setConfetti] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Reusable celebration burst — fired for finishing all habits, finishing a
  // book, hitting a streak milestone, etc.
  const celebrate = useCallback(() => {
    setConfetti(true);
    setTimeout(() => setConfetti(false), 2400);
  }, []);

  const isDark = data.theme === "dark";
  const themeVars = isDark
    ? { "--bg": "#14171F", "--bg2": "#1B1F2A", "--card": "rgba(29,33,48,0.55)", "--card-solid": "#1D2130", "--text": "#E7E9F0", "--muted": "#9AA0AE", "--border": "rgba(231,233,240,0.09)", "--track": "rgba(231,233,240,0.08)", "--input": "rgba(255,255,255,0.04)", "--danger": "#E08585", "--danger-soft": "rgba(224,133,133,0.12)" }
    : { "--bg": "#F6F7FB", "--bg2": "#FFFFFF", "--card": "rgba(255,255,255,0.72)", "--card-solid": "#FFFFFF", "--text": "#232733", "--muted": "#6B7280", "--border": "rgba(35,39,51,0.08)", "--track": "rgba(35,39,51,0.06)", "--input": "rgba(35,39,51,0.03)", "--danger": "#C7635C", "--danger-soft": "rgba(199,99,92,0.10)" };

  const accentSoft = `${data.accent}22`;

  /* -------- Habit toggle with streak & xp logic -------- */
  const toggleHabit = useCallback((id, targetDate) => {
    const dayKey = targetDate || dateKey();
    const isToday = dayKey === dateKey();
    setData((d) => {
      const habits = d.habits.map((h) => {
        if (h.id !== id) return h;
        const has = h.completedDates.includes(dayKey);
        let completedDates = has ? h.completedDates.filter((x) => x !== dayKey) : [...h.completedDates, dayKey];
        // recompute current streak from completedDates (consecutive days ending today)
        let streak = 0;
        let cursor = new Date();
        while (completedDates.includes(dateKey(cursor))) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        }
        const bestStreak = Math.max(h.bestStreak || 0, streak);
        return { ...h, completedDates, bestStreak };
      });
      if (isToday) {
        const allDoneNow = habits.length > 0 && habits.every((h) => h.completedDates.includes(dayKey));
        if (allDoneNow) {
          setTimeout(celebrate, 150);
        }
      }
      const wasCompleting = !d.habits.find((h) => h.id === id).completedDates.includes(dayKey);
      return { ...d, habits, xp: d.xp + (wasCompleting ? 10 : -10) };
    });
  }, [setData, celebrate]);

  const addFocusSession = useCallback((minutes) => {
    setData((d) => ({ ...d, focusSessions: [...d.focusSessions, { date: dateKey(), minutes }], xp: d.xp + 15 }));
  }, [setData]);

  /* -------- derived stats for achievements & xp -------- */
  const xpInfo = useMemo(() => {
    const level = Math.floor(data.xp / 100) + 1;
    const pct = data.xp % 100;
    return { level, pct, xp: data.xp };
  }, [data.xp]);

  const achievements = useMemo(() => {
    const totalHabitCompletions = data.habits.reduce((sum, h) => sum + h.completedDates.length, 0);
    const bestStreak = Math.max(0, ...data.habits.map((h) => h.bestStreak || 0));
    const booksFinished = data.books.filter((b) => b.currentPage >= b.totalPages && b.totalPages > 0).length;
    const focusSessions = data.focusSessions.length;
    const englishMinutes = Object.values(data.english).reduce((sum, e) => sum + (e.minutes || 0), 0);
    const journalEntries = Object.keys(data.journal).length;
    const stats = { totalHabitCompletions, bestStreak, booksFinished, focusSessions, englishMinutes, journalEntries, level: xpInfo.level };
    return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.id);
  }, [data, xpInfo.level]);

  /* -------- keyboard shortcuts -------- */
  useEffect(() => {
    const handler = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= NAV.length && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        setTab(NAV[n - 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const signOut = () => supabase?.auth.signOut();

  const views = {
    dashboard: <Dashboard data={data} toggleHabit={toggleHabit} xpInfo={xpInfo} achievements={achievements} goTo={setTab} />,
    habits: <HabitsView data={data} setData={setData} toggleHabit={toggleHabit} />,
    tasks: <TasksView data={data} setData={setData} />,
    focus: <FocusView addFocusSession={addFocusSession} accent={data.accent} />,
    reading: <ReadingView data={data} setData={setData} celebrate={celebrate} />,
    english: <EnglishView data={data} setData={setData} />,
    skills: <SkillsView data={data} setData={setData} />,
    trackers: <TrackersView data={data} setData={setData} />,
    bible: <BibleView data={data} setData={setData} />,
    journal: <JournalView data={data} setData={setData} />,
    stats: <StatsView data={data} />,
    settings: <SettingsView data={data} setData={setData} cloudConfigured={cloudConfigured} userEmail={userEmail} onSignOut={signOut} syncStatus={syncStatus} />,
  };

  const visibleNav = NAV.filter((n) => n.id === "dashboard" || n.id === "settings" || !(data.hiddenSections || []).includes(n.id));
  const primaryNav = visibleNav.slice(0, 4);
  const moreNav = visibleNav.slice(4);

  return (
    <div style={{ ...themeVars, "--accent": data.accent, "--accent-soft": accentSoft, background: "var(--bg)", minHeight: "100vh" }} className="flex relative overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .font-serif { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
      `}</style>

      {/* ambient background — soft, slow-drifting glow, purely decorative */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl"
          style={{ background: "var(--accent)", opacity: 0.10 }}
        />
        <motion.div
          animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
          transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full blur-3xl"
          style={{ background: "#8E97FD", opacity: 0.08 }}
        />
      </div>

      <Confetti fire={confetti} />

      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r p-5 relative" style={{ borderColor: "var(--border)", zIndex: 1 }}>
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <Leaf size={16} className="text-white" />
          </div>
          <span className="font-serif text-lg" style={{ color: "var(--text)" }}>FocusFlow</span>
        </div>
        <nav className="flex-1 space-y-1">
          {visibleNav.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ background: tab === n.id ? "var(--accent-soft)" : "transparent", color: tab === n.id ? "var(--accent)" : "var(--muted)" }}
            >
              <n.icon size={17} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="pt-4 mt-4 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
            <Award size={14} style={{ color: "var(--accent)" }} />
            Level {xpInfo.level} · {achievements.length} badges
          </div>
          {cloudConfigured && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "var(--track)" }}>
              <span className="text-[11px] truncate" style={{ color: "var(--muted)" }}>{userEmail}</span>
              <SyncBadge status={syncStatus} />
            </div>
          )}
        </div>
      </aside>

      {/* ---------------- Main content ---------------- */}
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ zIndex: 1 }}>
        {/* mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <Leaf size={14} className="text-white" />
            </div>
            <span className="font-serif text-base" style={{ color: "var(--text)" }}>FocusFlow</span>
          </div>
          <div className="flex items-center gap-3">
            {cloudConfigured && <SyncBadge status={syncStatus} />}
            <button onClick={() => setData({ ...data, theme: isDark ? "light" : "dark" })} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--muted)" }}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {views[tab]}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 flex justify-around items-center py-2 border-t backdrop-blur-xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          {primaryNav.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)} className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg" style={{ color: tab === n.id ? "var(--accent)" : "var(--muted)" }}>
              <n.icon size={18} />
              <span className="text-[9px]">{n.label}</span>
            </button>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg"
            style={{ color: moreNav.some((n) => n.id === tab) ? "var(--accent)" : "var(--muted)" }}
          >
            <Menu size={18} />
            <span className="text-[9px]">More</span>
          </button>
        </nav>
      </div>

      {/* mobile "more" sheet */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-3">
          {moreNav.map((n) => (
            <button
              key={n.id}
              onClick={() => { setTab(n.id); setMoreOpen(false); }}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl text-xs font-medium"
              style={{ background: tab === n.id ? "var(--accent-soft)" : "var(--track)", color: tab === n.id ? "var(--accent)" : "var(--text)" }}
            >
              <n.icon size={20} />
              {n.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
