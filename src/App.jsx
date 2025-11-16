import React, { useState, useEffect, useMemo } from "react";

/** ---------- Types (conceptual) ----------
User {
  id, email, name, year, branch, strongSubjects[], bio, avatar,
  role: "student" | "admin",
  xp, level, ratingAvg, ratingCount, isBlocked
}
Query {
  id, title, description, subjectTags[], preferredMentorType,
  preferredMode, timePreference, status, createdAt,
  askerId, menteeYear, sessions[]
}
Session {
  id, queryId, mentorId, menteeId,
  dateTime, mode, locationOrLink,
  status, ratingForMentor, ratingForMentee
}
----------------------------------------*/

const SUBJECT_OPTIONS = [
  "DSA",
  "DBMS",
  "OS",
  "CN",
  "OOP",
  "Maths",
  "AI",
  "ML",
  "Cyber Security",
];

const YEAR_OPTIONS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const BRANCH_OPTIONS = ["IT", "CS", "ENTC", "Mechanical", "Civil", "Other"];

const XP_LEVELS = [
  { level: 1, min: 0, max: 99 },
  { level: 2, min: 100, max: 299 },
  { level: 3, min: 300, max: 699 },
  { level: 4, min: 700, max: 1499 },
  { level: 5, min: 1500, max: Infinity },
];

function computeLevel(xp) {
  const level = XP_LEVELS.find((l) => xp >= l.min && xp <= l.max);
  return level ? level.level : 1;
}

// ----- localStorage helpers -----
const STORAGE_KEY = "queryup_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Generate simple IDs
const id = () => Math.random().toString(36).slice(2);

// ----- App Root -----
export default function App() {
  const [state, setState] = useState(() => {
    const initial = loadState();
    return (
      initial || {
        users: [],
        queries: [],
        sessions: [],
        notifications: [],
      }
    );
  });

  const [currentUserId, setCurrentUserId] = useState(null);
  const [route, setRoute] = useState("landing"); // landing | auth | home | post | leader | profile | sessions | admin
  const [authMode, setAuthMode] = useState("signup");

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === currentUserId) || null,
    [state.users, currentUserId]
  );

  // XP & rating recompute if needed
  const updateUserStats = (userId) => {
    setState((prev) => {
      const sessionsAsMentor = prev.sessions.filter(
        (s) =>
          s.mentorId === userId &&
          s.status === "Completed" &&
          typeof s.ratingForMentor === "number"
      );

      const xp = sessionsAsMentor.reduce(
        (acc, s) => acc + s.ratingForMentor * 10,
        0
      );
      const ratingSum = sessionsAsMentor.reduce(
        (acc, s) => acc + s.ratingForMentor,
        0
      );
      const ratingCount = sessionsAsMentor.length;
      const ratingAvg = ratingCount ? ratingSum / ratingCount : 0;
      const level = computeLevel(xp);

      return {
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId ? { ...u, xp, ratingAvg, ratingCount, level } : u
        ),
      };
    });
  };

  // Auth handlers
  const handleSignup = (email, password) => {
    if (!email.endsWith("@pccoepune.org")) {
      alert("Only @pccoepune.org emails are allowed.");
      return;
    }
    const exists = state.users.some((u) => u.email === email);
    if (exists) {
      alert("User already exists. Please login.");
      setAuthMode("login");
      return;
    }

    const nameDefault = email.split("@")[0].replace(/\./g, " ");
    const newUser = {
      id: id(),
      email,
      password,
      name: nameDefault,
      year: null,
      branch: null,
      strongSubjects: [],
      bio: "",
      avatar: null,
      role: state.users.length === 0 ? "admin" : "student", // first user = admin
      xp: 0,
      level: 1,
      ratingAvg: 0,
      ratingCount: 0,
      isBlocked: false,
    };

    setState((prev) => ({ ...prev, users: [...prev.users, newUser] }));
    setCurrentUserId(newUser.id);
    setRoute("profile");
  };

  const handleLogin = (email, password) => {
    const user = state.users.find(
      (u) => u.email === email && u.password === password
    );
    if (!user) {
      alert("Invalid credentials.");
      return;
    }
    if (user.isBlocked) {
      alert("Your account is blocked. Contact admin.");
      return;
    }
    setCurrentUserId(user.id);
    if (!user.year || !user.strongSubjects?.length) {
      setRoute("profile");
    } else {
      setRoute("home");
    }
  };

  const handleLogout = () => {
    setCurrentUserId(null);
    setRoute("landing");
  };

  const updateProfile = (updates) => {
    if (!currentUser) return;
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === currentUser.id ? { ...u, ...updates } : u
      ),
    }));
  };

  // Query operations
  const createQuery = (data) => {
    if (!currentUser) return;
    const newQuery = {
      id: id(),
      title: data.title,
      description: data.description,
      subjectTags: data.subjectTags,
      preferredMentorType: data.preferredMentorType,
      preferredMode: data.preferredMode,
      timePreference: data.timePreference,
      status: "Open",
      createdAt: Date.now(),
      askerId: currentUser.id,
    };
    setState((prev) => ({
      ...prev,
      queries: [newQuery, ...prev.queries],
    }));
  };

  const acceptQuery = (queryId) => {
    if (!currentUser) return;
    const q = state.queries.find((q) => q.id === queryId);
    if (!q) return;
    if (q.askerId === currentUser.id) {
      alert("You cannot accept your own query.");
      return;
    }
    // Check if already has a session
    const existing = state.sessions.find((s) => s.queryId === queryId);
    if (existing) {
      alert("This query already has a mentor.");
      return;
    }

    const dateTime = new Date();
    dateTime.setHours(dateTime.getHours() + 1);

    const newSession = {
      id: id(),
      queryId,
      mentorId: currentUser.id,
      menteeId: q.askerId,
      dateTime: dateTime.toISOString(),
      mode: q.preferredMode === "Offline" ? "Offline" : "Online",
      locationOrLink:
        q.preferredMode === "Offline"
          ? "PCCOE Library"
          : "https://meet.google.com/example",
      status: "Confirmed", // MVP auto-confirm
      ratingForMentor: null,
      ratingForMentee: null,
    };

    setState((prev) => ({
      ...prev,
      sessions: [...prev.sessions, newSession],
      queries: prev.queries.map((qq) =>
        qq.id === queryId ? { ...qq, status: "In Progress" } : qq
      ),
      notifications: [
        ...prev.notifications,
        {
          id: id(),
          userId: q.askerId,
          message: `Your query "${q.title}" has been accepted by ${currentUser.name}.`,
          read: false,
          createdAt: Date.now(),
        },
      ],
    }));

    alert("You are now the mentor for this query! Session auto-scheduled.");
  };

  const markSessionComplete = (sessionId, asUser, didHappen) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, status: didHappen ? "Completed" : "No-show" }
          : s
      ),
    }));
  };

  const rateSession = (sessionId, ratingValue, forMentor) => {
    setState((prev) => {
      const nextSessions = prev.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        if (forMentor) {
          return { ...s, ratingForMentor: ratingValue };
        } else {
          return { ...s, ratingForMentee: ratingValue };
        }
      });

      return {
        ...prev,
        sessions: nextSessions,
      };
    });

    const s = state.sessions.find((s) => s.id === sessionId);
    if (s && forMentor) {
      // update mentor XP and rating
      updateUserStats(s.mentorId);
    }
  };

  // Leaderboard compute
  const leaderboard = useMemo(() => {
    const sorted = [...state.users].sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
      const aSessions = state.sessions.filter(
        (s) => s.mentorId === a.id && s.status === "Completed"
      ).length;
      const bSessions = state.sessions.filter(
        (s) => s.mentorId === b.id && s.status === "Completed"
      ).length;
      if (bSessions !== aSessions) return bSessions - aSessions;
      return a.id.localeCompare(b.id);
    });
    return sorted;
  }, [state.users, state.sessions]);

  // Admin actions
  const toggleBlockUser = (userId) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId ? { ...u, isBlocked: !u.isBlocked } : u
      ),
    }));
  };

  const isAuthed = !!currentUser;

  return (
    <div className="min-h-screen text-slate-100">
      <div className="scanlines">
        <Navbar
          currentUser={currentUser}
          onLogout={handleLogout}
          setRoute={setRoute}
          isAuthed={isAuthed}
        />

        <main className="max-w-6xl mx-auto px-4 pb-12 pt-24">
          {!isAuthed && route === "landing" && (
            <Landing setRoute={setRoute} setAuthMode={setAuthMode} />
          )}

          {!isAuthed && route === "auth" && (
            <AuthScreen
              mode={authMode}
              setMode={setAuthMode}
              onSignup={handleSignup}
              onLogin={handleLogin}
            />
          )}

          {isAuthed && route === "profile" && (
            <ProfileSetup
              user={currentUser}
              updateProfile={updateProfile}
              onDone={() => setRoute("home")}
            />
          )}

          {isAuthed && route === "home" && (
            <HomeFeed
              currentUser={currentUser}
              state={state}
              acceptQuery={acceptQuery}
              setRoute={setRoute}
            />
          )}

          {isAuthed && route === "post" && (
            <PostQueryPage
              createQuery={createQuery}
              setRoute={setRoute}
            />
          )}

          {isAuthed && route === "leader" && (
            <LeaderboardPage leaderboard={leaderboard} />
          )}

          {isAuthed && route === "profileView" && (
            <ProfileViewPage
              user={currentUser}
              state={state}
            />
          )}

          {isAuthed && route === "sessions" && (
            <SessionsPage
              currentUser={currentUser}
              state={state}
              markSessionComplete={markSessionComplete}
              rateSession={rateSession}
            />
          )}

          {isAuthed && currentUser.role === "admin" && route === "admin" && (
            <AdminDashboard
              state={state}
              toggleBlockUser={toggleBlockUser}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ---------- UI Components ---------- */

function Navbar({ currentUser, onLogout, setRoute, isAuthed }) {
  return (
    <header className="fixed top-0 inset-x-0 z-20 bg-slate-950/70 border-b border-white/10 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setRoute(isAuthed ? "home" : "landing")}
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-lg shadow-primary/40">
            <span className="font-pixel text-xs">Q↑</span>
          </div>
          <div>
            <div className="font-semibold tracking-tight">QueryUP</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest">
              Mentorship XP
            </div>
          </div>
        </div>

        {isAuthed && (
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <NavButton onClick={() => setRoute("home")}>Home</NavButton>
            <NavButton onClick={() => setRoute("post")}>
              Post Query
            </NavButton>
            <NavButton onClick={() => setRoute("leader")}>
              Leaderboard
            </NavButton>
            <NavButton onClick={() => setRoute("sessions")}>
              My Sessions
            </NavButton>
            {currentUser?.role === "admin" && (
              <NavButton onClick={() => setRoute("admin")}>
                Admin
              </NavButton>
            )}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {isAuthed && currentUser && (
            <button
              className="flex items-center gap-2 text-xs md:text-sm"
              onClick={() => setRoute("profileView")}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center text-[10px] font-bold">
                {currentUser.name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-semibold">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span>LVL {currentUser.level || 1}</span>
                  <span>•</span>
                  <span>{Math.round(currentUser.xp || 0)} XP</span>
                </div>
              </div>
            </button>
          )}

          {isAuthed ? (
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-xs md:text-sm"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => {
                setRoute("auth");
              }}
              className="px-4 py-1.5 rounded-full bg-primary hover:bg-primary/90 text-xs md:text-sm font-medium shadow-lg shadow-primary/40"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/5 text-xs md:text-sm"
    >
      {children}
    </button>
  );
}

/* Landing */

function Landing({ setRoute, setAuthMode }) {
  return (
    <div className="grid md:grid-cols-2 gap-8 items-center">
      <div>
        <div className="inline-flex items-center gap-2 badge-pixel mb-4">
          <span className="font-pixel text-[8px]">NEW</span>
          <span>Student Mentorship • PCCOE Only</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mb-4">
          Turn your{" "}
          <span className="text-primary">
            doubts
          </span>{" "}
          into{" "}
          <span className="text-accent">
            XP.
          </span>
        </h1>
        <p className="text-slate-300 mb-6 text-sm md:text-base">
          QueryUP connects PCCOE students for quick, peer-to-peer academic
          help. Post queries, accept doubts, earn XP and climb the
          leaderboard — all inside a safe, college-only space.
        </p>
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => {
              setAuthMode("signup");
              setRoute("auth");
            }}
            className="px-5 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-sm font-medium shadow-lg shadow-primary/40"
          >
            Sign up with PCCOE Email
          </button>
          <button
            onClick={() => {
              setAuthMode("login");
              setRoute("auth");
            }}
            className="px-5 py-2.5 rounded-full bg-slate-900 border border-white/10 hover:bg-slate-800 text-sm"
          >
            I already have an account
          </button>
        </div>
        <div className="flex gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            Verified PCCOE-only access
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            Ratings, XP, leaderboard
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="card-glass p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Live Queries
          </h2>
          <div className="space-y-3 text-xs">
            <MockQueryCard
              title="Help needed with DSA recursion problem"
              tags={["DSA", "Recursion"]}
              year="2nd Year"
            />
            <MockQueryCard
              title="Normalize this DB schema (3NF)"
              tags={["DBMS"]}
              year="3rd Year"
            />
            <MockQueryCard
              title="OS deadlock vs starvation"
              tags={["OS"]}
              year="1st Year"
            />
          </div>
        </div>

        <div className="card-glass p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            Top Mentors (All-time)
          </h2>
          <div className="space-y-3 text-xs">
            <MockMentorRow
              name="Rohan K."
              year="3rd Year • IT"
              xp={1240}
              rating={4.9}
            />
            <MockMentorRow
              name="Priya S."
              year="4th Year • CS"
              xp={830}
              rating={4.7}
            />
            <MockMentorRow
              name="Ananya J."
              year="2nd Year • ENTC"
              xp={410}
              rating={4.6}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockQueryCard({ title, tags, year }) {
  return (
    <div className="flex items-start justify-between border border-white/5 rounded-xl p-3 bg-black/20">
      <div>
        <div className="font-medium text-slate-100">{title}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-400">{year}</div>
      </div>
      <button className="px-2 py-1 rounded-full text-[10px] bg-accent/20 text-accent font-medium">
        Accept
      </button>
    </div>
  );
}

function MockMentorRow({ name, year, xp, rating }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium text-slate-100">{name}</div>
        <div className="text-[10px] text-slate-400">{year}</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-accent font-semibold">
          {xp} XP
        </div>
        <div className="text-[10px] text-yellow-300">
          ★ {rating.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

/* Auth */

function AuthScreen({ mode, setMode, onSignup, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === "signup") onSignup(email.trim(), password);
    else onLogin(email.trim(), password);
  };

  return (
    <div className="max-w-md mx-auto card-glass p-6">
      <h2 className="text-xl font-semibold mb-1">
        {mode === "signup" ? "Create your QueryUP account" : "Welcome back"}
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        {mode === "signup"
          ? "Use your PCCOE email (ending with @pccoepune.org). We’ll keep this space college-only."
          : "Login with the credentials you used for signup."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <div>
          <label className="block text-xs mb-1 text-slate-300">
            PCCOE Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-sm"
            placeholder="yourname@pccoepune.org"
          />
        </div>
        <div>
          <label className="block text-xs mb-1 text-slate-300">
            Password
          </label>
          <input
            type="password"
            required
            minLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-sm"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          className="w-full mt-1 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-sm font-medium shadow-lg shadow-primary/40"
        >
          {mode === "signup" ? "Sign up" : "Login"}
        </button>
      </form>

      <div className="mt-4 text-xs text-slate-400 text-center">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button
              className="text-primary hover:underline"
              onClick={() => setMode("login")}
            >
              Login
            </button>
          </>
        ) : (
          <>
            New here?{" "}
            <button
              className="text-primary hover:underline"
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* Profile Setup */

function ProfileSetup({ user, updateProfile, onDone }) {
  const [name, setName] = useState(user.name || "");
  const [year, setYear] = useState(user.year || "");
  const [branch, setBranch] = useState(user.branch || "");
  const [bio, setBio] = useState(user.bio || "");
  const [strongSubjects, setStrongSubjects] = useState(
    user.strongSubjects || []
  );
  const [customSubject, setCustomSubject] = useState("");

  const toggleSubject = (subj) => {
    setStrongSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  };

  const handleAddCustom = () => {
    const val = customSubject.trim();
    if (!val) return;
    if (!strongSubjects.includes(val)) {
      setStrongSubjects((prev) => [...prev, val]);
    }
    setCustomSubject("");
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!name || !year || strongSubjects.length === 0) {
      alert("Name, Year and at least 1 strong subject are required.");
      return;
    }
    updateProfile({
      name,
      year,
      branch,
      bio,
      strongSubjects,
    });
    onDone();
  };

  return (
    <div className="max-w-2xl mx-auto card-glass p-6">
      <h2 className="text-xl font-semibold mb-2">
        Complete your mentor profile
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        This helps QueryUP match doubts to your strengths and show
        relevant queries on your home feed.
      </p>

      <form onSubmit={handleSave} className="space-y-4 text-sm">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Full Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-sm"
              placeholder="Ananya Joshi"
            />
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Year of Study
            </label>
            <select
              value={year || ""}
              onChange={(e) => setYear(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-sm"
              required
            >
              <option value="">Select year</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Branch (optional)
            </label>
            <select
              value={branch || ""}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-sm"
            >
              <option value="">Select branch</option>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Short Bio (optional)
            </label>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-sm"
              placeholder="Strong in DSA & DBMS, happy to help juniors."
            />
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-300">
            Strong Subjects (pick at least 1)
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {SUBJECT_OPTIONS.map((subj) => {
              const selected = strongSubjects.includes(subj);
              return (
                <button
                  type="button"
                  key={subj}
                  onClick={() => toggleSubject(subj)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    selected
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-slate-900 border-white/10 text-slate-300 hover:border-primary/50"
                  }`}
                >
                  {subj}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 items-center">
            <input
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-xs"
              placeholder="Other subject (e.g., TOC)"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs"
            >
              Add
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="mt-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-sm font-medium shadow-lg shadow-primary/40"
        >
          Save & Go to Home
        </button>
      </form>
    </div>
  );
}

/* Home Feed */

function HomeFeed({ currentUser, state, acceptQuery, setRoute }) {
  const [subjectFilter, setSubjectFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [onlyFresh, setOnlyFresh] = useState(false);
  const [search, setSearch] = useState("");

  const myId = currentUser.id;
  const queries = state.queries.filter((q) => q.askerId !== myId);

  const filtered = queries.filter((q) => {
    if (q.status !== "Open") return false;
    if (subjectFilter && !q.subjectTags.includes(subjectFilter)) return false;
    if (yearFilter) {
      const asker = state.users.find((u) => u.id === q.askerId);
      if (!asker || asker.year !== yearFilter) return false;
    }
    if (onlyFresh) {
      const hasSession = state.sessions.some((s) => s.queryId === q.id);
      if (hasSession) return false;
    }
    if (search) {
      const text = (q.title + " " + q.description).toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    // priority: subject match, recency
    const aMatch = a.subjectTags.some((t) =>
      currentUser.strongSubjects.includes(t)
    );
    const bMatch = b.subjectTags.some((t) =>
      currentUser.strongSubjects.includes(t)
    );
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="grid md:grid-cols-[260px,1fr] gap-6">
      <div className="card-glass p-4 h-fit sticky top-24">
        <h3 className="text-sm font-semibold mb-3">Filters</h3>
        <div className="space-y-3 text-xs">
          <div>
            <label className="block mb-1 text-slate-300">
              Subject
            </label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary"
            >
              <option value="">All subjects</option>
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-slate-300">
              Year of Asker
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary"
            >
              <option value="">All years</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span>Show fresh queries only</span>
            <input
              type="checkbox"
              checked={onlyFresh}
              onChange={(e) => setOnlyFresh(e.target.checked)}
            />
          </div>
        </div>
        <button
          onClick={() => setRoute("post")}
          className="mt-4 w-full px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-xs font-medium shadow-lg shadow-primary/40"
        >
          Post a new query
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Open queries for you
            </h2>
            <p className="text-xs text-slate-400">
              Based on your strengths: {currentUser.strongSubjects.join(", ")}.
            </p>
          </div>
          <div className="w-full sm:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or description..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-xs"
            />
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="card-glass p-6 text-sm text-slate-300">
            No matching queries right now. Try changing filters or post a
            query yourself!
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((q) => {
              const asker = state.users.find((u) => u.id === q.askerId);
              return (
                <div key={q.id} className="card-glass p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="text-sm font-semibold mb-1">
                        {q.title}
                      </h3>
                      <p className="text-xs text-slate-300 line-clamp-3 mb-2">
                        {q.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {q.subjectTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Asked by{" "}
                        <span className="text-slate-200">
                          {asker?.name || "Unknown"}
                        </span>{" "}
                        • {asker?.year || "-"} •{" "}
                        {new Date(q.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => acceptQuery(q.id)}
                      className="px-3 py-1.5 rounded-xl bg-accent/20 text-accent text-xs font-semibold hover:bg-accent/30"
                    >
                      Accept & Help
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                    <span>
                      Mentor type: {q.preferredMentorType || "Any"}
                    </span>
                    <span>•</span>
                    <span>Mode: {q.preferredMode || "Either"}</span>
                    <span>•</span>
                    <span>Time: {q.timePreference || "Flexible"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* Post Query */

function PostQueryPage({ createQuery, setRoute }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectTags, setSubjectTags] = useState([]);
  const [preferredMentorType, setPreferredMentorType] = useState("Any");
  const [preferredMode, setPreferredMode] = useState("Either");
  const [timePreference, setTimePreference] = useState("");

  const toggleTag = (tag) => {
    setSubjectTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !description || subjectTags.length === 0) {
      alert("Title, description and at least 1 subject tag are required.");
      return;
    }
    createQuery({
      title,
      description,
      subjectTags,
      preferredMentorType,
      preferredMode,
      timePreference,
    });
    alert("Query launched! 🚀");
    setRoute("home");
  };

  return (
    <div className="max-w-2xl mx-auto card-glass p-6">
      <h2 className="text-xl font-semibold mb-2">
        Post a new query
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        Describe your doubt clearly so the right mentor can pick it up.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div>
          <label className="block text-xs mb-1 text-slate-300">
            Title
          </label>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary"
            placeholder="Struggling with recursion in DSA"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-300">
            Description
          </label>
          <textarea
            value={description}
            minLength={20}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary resize-none"
            placeholder="Explain your doubt, what you already tried, and where you're stuck."
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-300">
            Subject Tags (pick at least 1)
          </label>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_OPTIONS.map((tag) => {
              const selected = subjectTags.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    selected
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-slate-900 border-white/10 text-slate-300 hover:border-primary/50"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Preferred mentor type
            </label>
            <select
              value={preferredMentorType}
              onChange={(e) => setPreferredMentorType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-xs"
            >
              <option>Any</option>
              <option>Senior</option>
              <option>Same year</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Preferred mode
            </label>
            <select
              value={preferredMode}
              onChange={(e) => setPreferredMode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-xs"
            >
              <option>Either</option>
              <option>Online</option>
              <option>Offline</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 text-slate-300">
              Time preference
            </label>
            <select
              value={timePreference}
              onChange={(e) => setTimePreference(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 focus:outline-none focus:border-primary text-xs"
            >
              <option value="">Flexible</option>
              <option>Evenings</option>
              <option>Weekends</option>
              <option>Late night</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setRoute("home")}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-xs font-medium shadow-lg shadow-primary/40"
          >
            Post Query
          </button>
        </div>
      </form>
    </div>
  );
}

/* Leaderboard */

function LeaderboardPage({ leaderboard }) {
  return (
    <div className="card-glass p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold">Leaderboard</h2>
          <p className="text-xs text-slate-400">
            Ranked by total XP (rating × 10 per completed session).
          </p>
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <p className="text-sm text-slate-300">
          No mentors yet. Be the first to help someone and earn XP!
        </p>
      ) : (
        <div className="overflow-x-auto text-xs">
          <table className="w-full border-separate border-spacing-y-1">
            <thead className="text-[11px] text-slate-400">
              <tr>
                <th className="text-left">Rank</th>
                <th className="text-left">Mentor</th>
                <th>Year</th>
                <th>XP</th>
                <th>Avg Rating</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((u, idx) => (
                <tr
                  key={u.id}
                  className="card-glass"
                  style={{ borderRadius: 9999 }}
                >
                  <td className="px-3 py-2">
                    {idx + 1 === 1 ? "🥇" : idx + 1 === 2 ? "🥈" : idx + 1 === 3 ? "🥉" : idx + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center text-[10px] font-bold">
                        {u.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-[10px] text-slate-400">
                          LVL {u.level || 1}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {u.year || "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {Math.round(u.xp || 0)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {u.ratingCount ? (
                      <>
                        ★ {u.ratingAvg.toFixed(2)}{" "}
                        <span className="text-slate-500">
                          ({u.ratingCount})
                        </span>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {u.ratingCount || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* Profile View */

function ProfileViewPage({ user, state }) {
  const sessionsAsMentor = state.sessions.filter(
    (s) => s.mentorId === user.id && s.status === "Completed"
  );
  const sessionsAsMentee = state.sessions.filter(
    (s) => s.menteeId === user.id && s.status === "Completed"
  );

  return (
    <div className="grid md:grid-cols-[260px,1fr] gap-6">
      <div className="card-glass p-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center text-xl font-bold mb-2">
            {user.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="font-semibold text-sm">{user.name}</div>
          <div className="text-[11px] text-slate-400">
            {user.year || "Year not set"}{" "}
            {user.branch ? `• ${user.branch}` : ""}
          </div>

          <div className="mt-3 w-full">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Level {user.level || 1}</span>
              <span>{Math.round(user.xp || 0)} XP</span>
            </div>
            <div className="xp-bar">
              <div
                className="xp-bar-inner"
                style={{
                  width: `${Math.min(100, ((user.xp || 0) % 200) / 2)}%`,
                }}
              ></div>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-300">
            <div>
              Rating:{" "}
              {user.ratingCount ? (
                <>
                  ★ {user.ratingAvg.toFixed(2)}{" "}
                  <span className="text-slate-500">
                    ({user.ratingCount})
                  </span>
                </>
              ) : (
                "No ratings yet"
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1 justify-center">
            {user.strongSubjects?.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]"
              >
                {s}
              </span>
            ))}
          </div>

          {user.bio && (
            <p className="mt-3 text-xs text-slate-300">{user.bio}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card-glass p-4">
          <h3 className="text-sm font-semibold mb-2">
            Sessions as Mentor
          </h3>
          {sessionsAsMentor.length === 0 ? (
            <p className="text-xs text-slate-300">
              No completed sessions yet. Accept some queries to start
              earning XP!
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {sessionsAsMentor.map((s) => {
                const q = state.queries.find((q) => q.id === s.queryId);
                const mentee = state.users.find(
                  (u) => u.id === s.menteeId
                );
                return (
                  <div
                    key={s.id}
                    className="border border-white/5 rounded-xl p-3 bg-black/20"
                  >
                    <div className="font-medium">
                      {q?.title || "Query"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Mentee: {mentee?.name || "-"} •{" "}
                      {new Date(s.dateTime).toLocaleString()}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-300">
                      Rating:{" "}
                      {typeof s.ratingForMentor === "number"
                        ? `★ ${s.ratingForMentor}`
                        : "Not rated yet"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-glass p-4">
          <h3 className="text-sm font-semibold mb-2">
            Sessions as Mentee
          </h3>
          {sessionsAsMentee.length === 0 ? (
            <p className="text-xs text-slate-300">
              You haven’t completed any sessions as mentee yet.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {sessionsAsMentee.map((s) => {
                const q = state.queries.find((q) => q.id === s.queryId);
                const mentor = state.users.find(
                  (u) => u.id === s.mentorId
                );
                return (
                  <div
                    key={s.id}
                    className="border border-white/5 rounded-xl p-3 bg-black/20"
                  >
                    <div className="font-medium">
                      {q?.title || "Query"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Mentor: {mentor?.name || "-"} •{" "}
                      {new Date(s.dateTime).toLocaleString()}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-300">
                      Your rating:{" "}
                      {typeof s.ratingForMentor === "number"
                        ? `★ ${s.ratingForMentor}`
                        : "Not rated yet"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Sessions */

function SessionsPage({
  currentUser,
  state,
  markSessionComplete,
  rateSession,
}) {
  const myId = currentUser.id;

  const asMentor = state.sessions.filter(
    (s) => s.mentorId === myId
  );
  const asMentee = state.sessions.filter(
    (s) => s.menteeId === myId
  );

  const renderSessionCard = (s, role) => {
    const query = state.queries.find((q) => q.id === s.queryId);
    const other =
      role === "mentor"
        ? state.users.find((u) => u.id === s.menteeId)
        : state.users.find((u) => u.id === s.mentorId);

    const isCompleted = s.status === "Completed";
    const isFuture =
      new Date(s.dateTime).getTime() > Date.now() &&
      s.status === "Confirmed";

    const myRating =
      role === "mentor" ? s.ratingForMentee : s.ratingForMentor;

    return (
      <div
        key={s.id}
        className="border border-white/5 rounded-xl p-3 bg-black/20 text-xs"
      >
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">
              {query?.title || "Query"}
            </div>
            <div className="text-[11px] text-slate-400">
              With: {other?.name || "-"} •{" "}
              {new Date(s.dateTime).toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-slate-300">
              Mode: {s.mode} • Status: {s.status}
            </div>
            <div className="mt-1 text-[11px] text-slate-300">
              Link/location:{" "}
              <span className="text-sky-400 break-all">
                {s.locationOrLink}
              </span>
            </div>
          </div>
        </div>

        {!isFuture && !isCompleted && (
          <div className="mt-2 flex gap-2 text-[11px]">
            <button
              onClick={() => markSessionComplete(s.id, role, true)}
              className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300"
            >
              Mark Completed
            </button>
            <button
              onClick={() => markSessionComplete(s.id, role, false)}
              className="px-2 py-1 rounded-full bg-red-500/20 text-red-300"
            >
              Mark Did Not Happen
            </button>
          </div>
        )}

        {isCompleted && myRating == null && (
          <div className="mt-2">
            <div className="text-[11px] text-slate-300 mb-1">
              Rate this session:
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  onClick={() =>
                    rateSession(
                      s.id,
                      r,
                      role === "mentee" // mentee rates mentor for XP
                    )
                  }
                  className="px-2 py-1 rounded-full bg-slate-800 hover:bg-slate-700"
                >
                  ★ {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {isCompleted && myRating != null && (
          <div className="mt-2 text-[11px] text-emerald-300">
            You rated: ★ {myRating}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">
          Sessions as Mentor
        </h3>
        {asMentor.length === 0 ? (
          <p className="text-xs text-slate-300">
            You’re not mentoring anyone yet. Accept a query from the home
            feed to start earning XP.
          </p>
        ) : (
          <div className="space-y-2">
            {asMentor.map((s) => renderSessionCard(s, "mentor"))}
          </div>
        )}
      </div>

      <div className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">
          Sessions as Mentee
        </h3>
        {asMentee.length === 0 ? (
          <p className="text-xs text-slate-300">
            You haven’t scheduled any sessions as mentee yet.
          </p>
        ) : (
          <div className="space-y-2">
            {asMentee.map((s) => renderSessionCard(s, "mentee"))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Admin */

function AdminDashboard({ state, toggleBlockUser }) {
  return (
    <div className="space-y-4">
      <div className="card-glass p-4">
        <h2 className="text-xl font-semibold mb-2">Admin Dashboard</h2>
        <p className="text-xs text-slate-400">
          Basic moderation controls for users. (Reports & advanced actions
          can be added later.)
        </p>
      </div>

      <div className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">Users</h3>
        <div className="overflow-x-auto text-xs max-h-80">
          <table className="w-full border-separate border-spacing-y-1">
            <thead className="text-[11px] text-slate-400">
              <tr>
                <th className="text-left">Name</th>
                <th>Email</th>
                <th>Year</th>
                <th>XP</th>
                <th>Rating</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => (
                <tr
                  key={u.id}
                  className="card-glass"
                  style={{ borderRadius: 9999 }}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center text-[10px] font-bold">
                        {u.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2 text-center">
                    {u.year || "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {Math.round(u.xp || 0)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {u.ratingCount
                      ? `★ ${u.ratingAvg.toFixed(2)}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {u.role}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {u.isBlocked ? (
                      <span className="text-red-400">Blocked</span>
                    ) : (
                      <span className="text-emerald-400">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleBlockUser(u.id)}
                      className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-[11px]"
                    >
                      {u.isBlocked ? "Unblock" : "Block"}
                    </button>
                  </td>
                </tr>
              ))}
              {state.users.length === 0 && (
                <tr>
                  <td
                    colSpan="8"
                    className="px-3 py-2 text-center text-slate-300"
                  >
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
