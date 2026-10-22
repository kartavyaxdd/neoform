import { ProgramEditor as ProgramBuilder } from "./ProgramEditor";
import { ExercisePicker } from "./ExercisePicker";
import { WorkoutRecap } from "./WorkoutRecapScreen";
import { useRestAlerts, claimRestTimer } from "./restAlerts";
import { feedbackTone, unlockFeedbackAudio } from "./feedbackAudio";
import { WorkoutCelebration } from "./RewardProgress";
import { rewards } from "./rewards";
import { weekMonday } from "./workoutPresentation";
import { TimerSheet } from "./TimerSheet";
import { WeeklyReview } from "./WeeklyReviewSheet";
import { WorkoutDashboard } from "./WorkoutDashboard";
import { WorkoutPreview } from "./WorkoutPreview";
import { Levels } from "./Levels";
import { Button, Field, Num, Modal } from "./ui";
import { ProgramReviewSheet } from "./ProgramReviewSheet";
import { WorkoutHome } from "./WorkoutHome";
import { CoachSheet, CoachSettingsPanel } from "./CoachSheet";
import {
  classifyCoachingOutcomes,
  asRecommendation,
  evaluateCoaching,
} from "./coaching";
import { VideoInfo } from "./VideoInfo";
import { HevyImport } from "./HevyImport.jsx";
import { GeminiKeySettings } from "./GeminiKeySettings";
import { AiWizard } from "./AiWizard";
import { SessionLogger } from "./CompactLogger";
import {
  FinishSessionFeedback,
  SessionFeedbackFields,
  MuscleFeedbackFields,
  FeedbackSummary,
  MuscleReview,
  DecisionEvidence,
} from "./TrainingFeedback";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  LayoutGrid,
  Rocket,
  CircleEllipsis,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Download,
  Dumbbell,
  Flame,
  Layers,
  LogOut,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import * as D from "./domain";
import { exportHistoryBackup, importHistoryBackup } from "./historyBackup";
import { TrainingExposure } from "./TrainingExposure";
import {
  change,
  saveChange,
  clearLocal,
  initialize,
  login,
  logout,
  request,
  resolveConflict,
  sync,
  useStore,
  exportPendingCopies,
} from "./store";
type Page =
  | "overview"
  | "train"
  | "session"
  | "history"
  | "exercises"
  | "insights"
  | "settings";
const nav: [Page | "create", string, typeof Activity][] = [
  ["overview", "Dashboard", LayoutGrid],
  ["train", "Workout", Dumbbell],
  ["create", "Create", Plus],
  ["insights", "Levels", Rocket],
  ["settings", "More", CircleEllipsis],
];
const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString();
const duration = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const niceDate = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
function Brand() {
  return (
    <div className="brand">
      <svg width="32" height="34" viewBox="0 0 32 34" aria-hidden="true">
        <path
          d="M3 29V5h6l14 24h6V5h-6v16L9 5v24Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
      <span>
        NEOFORM<small>BUILD WITH INTENTION</small>
      </span>
    </div>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Dumbbell size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Auth() {
  const globalError = useStore().error;
  const [mode, setMode] = useState<"login" | "register">("register"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="auth-wrap">
      <div className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">YOUR TRAINING. TAKING SHAPE.</p>
          <h1>
            Small efforts.
            <br />
            Lasting <em>change.</em>
          </h1>
          <p>Train with purpose. Keep every rep. See what moves you forward.</p>
        </div>
        <div className="auth-art" aria-hidden="true">
          <div className="orbital" />
          <span>
            FORM
            <br />
            <i>FOLLOWS</i>
            <br />
            EFFORT
          </span>
        </div>
        <span className="muted">A private space for the work you put in.</span>
      </div>
      <main className="auth-card">
        <p className="eyebrow">WELCOME TO NEOFORM</p>
        <h2>
          {mode === "register" ? "Make room for progress." : "Welcome back."}
        </h2>
        <p>
          {mode === "register"
            ? "Create your private training journal. No subscription, no noise."
            : "Your training, right where you left it."}
        </p>
        {globalError && (
          <p className="error" role="status">
            {globalError}
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await login(mode, email, password);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <p className="caption">
            Use a unique passphrase of at least 12 characters. Email reset is
            not available.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary wide" disabled={busy}>
            {busy
              ? "Opening your journal…"
              : mode === "register"
                ? "Create account"
                : "Sign in"}
            <ArrowRight size={18} />
          </Button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setMode(mode === "register" ? "login" : "register");
            setError("");
          }}
        >
          {mode === "register"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <div className="privacy-note">
          <ShieldCheck size={19} />
          <span>Private by default. Your data belongs to your account.</span>
        </div>
      </main>
    </div>
  );
}
function PublicWorkspaceNotice() {
  return (
    <p className="banner public-workspace-notice" role="note">
      Public workspace: anyone with this URL can view/change data
      <span className="caption">
        {" "}
        · Cloud sync · Do not enter private information.
      </span>
    </p>
  );
}
function Onboarding() {
  const store = useStore(),
    [name, setName] = useState(""),
    [experience, setExperience] = useState<"New" | "Intermediate" | "Advanced">(
      "Intermediate",
    ),
    [goal, setGoal] = useState<
      "Build muscle" | "Strength + muscle" | "Consistency"
    >("Build muscle"),
    [days, setDays] = useState(3),
    [unit, setUnit] = useState<"kg" | "lb">("kg"),
    [gear, setGear] = useState<D.Exercise["equipment"][]>([
      "Barbell",
      "Dumbbell",
      "Machine",
      "Cable",
    ]),
    [template, setTemplate] = useState<
      "balanced" | "upper-lower" | "minimal" | "none"
    >("balanced");
  return (
    <main className="onboarding">
      <Brand />
      {store.accessMode === "public-workspace" && <PublicWorkspaceNotice />}
      <p className="eyebrow">01 / A PLACE TO BEGIN</p>
      <h1>
        Make it <em>your training.</em>
      </h1>
      <p>
        A few preferences shape your starting point. Everything stays editable.
      </p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          change((s) => ({
            ...s,
            profile: { name, experience, goal, days, equipment: gear },
            settings: { ...s.settings, unit },
            programs: template === "none" ? [] : [D.starterProgram(template)],
          }));
        }}
      >
        <div className="form-grid">
          <Field label="Your name">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Training experience">
            <select
              value={experience}
              onChange={(e) =>
                setExperience(e.target.value as typeof experience)
              }
            >
              {["New", "Intermediate", "Advanced"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Primary goal">
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as typeof goal)}
            >
              {["Build muscle", "Strength + muscle", "Consistency"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Training days / week">
            <Num
              label="Training days / week"
              value={days}
              min={1}
              max={7}
              onChange={setDays}
            />
          </Field>
          <Field label="Display units">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "kg" | "lb")}
            >
              <option>kg</option>
              <option>lb</option>
            </select>
          </Field>
          <Field label="Starting program">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as typeof template)}
            >
              <option value="balanced">Balanced foundations · 3 days</option>
              <option value="upper-lower">Upper / Lower · 4 days</option>
              <option value="minimal">Dumbbell foundations · 2 days</option>
              <option value="none">Build my own</option>
            </select>
          </Field>
        </div>
        <fieldset>
          <legend>Available equipment</legend>
          <div className="chips">
            {D.equipment.map((x) => (
              <label
                key={x}
                className={"choice " + (gear.includes(x) ? "selected" : "")}
              >
                <input
                  type="checkbox"
                  checked={gear.includes(x)}
                  onChange={() =>
                    setGear(
                      gear.includes(x)
                        ? gear.filter((y) => y !== x)
                        : [...gear, x],
                    )
                  }
                />
                {x}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="caption">
          Starter programs are editable templates, not completed workouts. Swap
          anything that doesn't fit your equipment.
        </p>
        <Button type="submit" variant="primary" disabled={!gear.length}>
          Build my workspace <ArrowRight size={18} />
        </Button>
        {store.error && (
          <p className="error" role="alert">
            {store.error}
          </p>
        )}
      </form>
    </main>
  );
}
export default function App() {
  const store = useStore(),
    s = store.box.data,
    [page, setPage] = useState<Page>(
      () => (localStorage.getItem("neoform:page") as Page) || "train",
    ),
    [modal, setModal] = useState<{
      title: string;
      content: ReactNode;
      footer?: ReactNode;
      presentation?: "screen" | "sheet";
    } | null>(null),
    [notice, setNotice] = useState(""),
    [tick, setTick] = useState(Date.now());
  const [celebration, setCelebration] = useState<{
    session: D.Session;
    xp: number;
  } | null>(null);
  const clockActive = !!(s.draft || s.timer);
  const close = () => setModal(null);
  // Account-scoped dialogs must never survive shared-cookie account switching.
  useEffect(() => {
    setModal(null);
    setNotice("");
    setCelebration(null);
  }, [store.user?.id]);
  const exercises = useMemo(
    () => [...D.catalog, ...s.customExercises],
    [s.customExercises],
  );
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [store.user?.id, !!s.profile]);
  useEffect(() => {
    const screen = document.getElementById("main-content");
    if (
      !screen?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animation = screen.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    return () => animation.cancel();
  }, [page]);
  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        s.settings.theme === "dark" ? "#141518" : "#f5f5f7",
      );
  }, [s.settings.theme]);
  useEffect(() => {
    if (!clockActive) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [clockActive]);
  const restAlerts = useRestAlerts(s.timer, store.user?.id);
  const expiredSound = useRef(false);
  useEffect(() => {
    if (
      s.timer &&
      !s.timer.paused &&
      tick >= s.timer.endAt &&
      !expiredSound.current
    ) {
      expiredSound.current = true;
      if (s.settings.timerSound && (!restAlerts.armed || !navigator.onLine))
        feedbackTone(false, s.settings.restChimeVolume);
    } else if (!s.timer || tick < s.timer.endAt) expiredSound.current = false;
  }, [
    tick,
    s.timer,
    s.settings.timerSound,
    s.settings.restChimeVolume,
    restAlerts.armed,
  ]);
  function go(p: Page) {
    setPage(p);
    localStorage.setItem("neoform:page", p);
    window.scrollTo(0, 0);
    setNotice("");
  }
  function confirm(title: string, text: string, action: () => void) {
    setModal({
      title,
      content: (
        <>
          <p>{text}</p>
          <div className="actions">
            <Button onClick={close}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                action();
                close();
              }}
            >
              Confirm
            </Button>
          </div>
        </>
      ),
    });
  }
  function pick(onPick: (e: D.Exercise) => void, muscle?: string) {
    setModal({
      title: muscle ? "Choose a substitute" : "Add an exercise",
      content: (
        <ExercisePicker
          exercises={exercises}
          preferredMuscle={muscle}
          onPick={(e) => {
            onPick(e);
            close();
          }}
        />
      ),
    });
  }
  function editProgram(p: D.Program) {
    setModal({
      title: p.name,
      presentation: "screen",
      content: (
        <ProgramBuilder
          program={p}
          exercises={exercises}
          sessions={s.sessions}
          experience={s.profile?.experience}
          save={async (p) => {
            if (
              await saveChange((s) => ({
                ...s,
                programs: s.programs.some((x) => x.id === p.id)
                  ? s.programs.map((x) => (x.id === p.id ? p : x))
                  : [...s.programs, p],
              }))
            )
              close();
          }}
        />
      ),
    });
  }
  function createMenu() {
    setModal({
      title: "Create",
      content: (
        <div className="create-menu">
          {store.accessMode === "public-workspace" ? (
            <p>
              AI is unavailable in public mode. Private Gemini keys are never
              used. Create programs manually or use an editable starter
              template.
            </p>
          ) : (
            <Button
              onClick={() =>
                setModal({
                  title: "AI program maker",
                  content: <AiWizard close={close} />,
                })
              }
            >
              <Flame size={20} />
              AI program
            </Button>
          )}
          <Button
            onClick={() =>
              editProgram({
                ...D.starterProgram("balanced"),
                name: "My program",
                workouts: [
                  { id: D.uid(), name: "Workout A", day: "", exercises: [] },
                ],
              })
            }
          >
            <Layers size={20} />
            New program
          </Button>
          <Button
            onClick={() => {
              close();
              start();
            }}
          >
            <Plus size={20} />
            Empty Workout
          </Button>
        </div>
      ),
    });
  }
  function SessionOptions() {
    const optionStore = useStore(),
      data = optionStore.box.data;
    const s = { ...data, draft: data.draft! };
    return (
      <>
        <Button
          onClick={() => {
            close();
            go("train");
          }}
        >
          Minimize workout
        </Button>
        <Button onClick={() => void sync()}>Sync now</Button>
        <p className="caption">{optionStore.status}</p>
        {s.draft && (
          <section className="panel session-notes">
            <Field label="Session name">
              <input
                value={s.draft.name}
                maxLength={120}
                onChange={(e) => {
                  if (e.target.value)
                    change((s) => ({
                      ...s,
                      draft: { ...s.draft!, name: e.target.value },
                    }));
                }}
              />
            </Field>
            <Field label="Session notes">
              <textarea
                placeholder="Anything worth remembering?"
                maxLength={2000}
                value={s.draft.notes}
                onChange={(e) =>
                  change((s) => ({
                    ...s,
                    draft: { ...s.draft!, notes: e.target.value },
                  }))
                }
              />
            </Field>
          </section>
        )}
        <Button
          variant="ghost danger-text"
          onClick={() =>
            confirm(
              "Discard active workout?",
              "All sets and notes in this active draft will be removed. This action cannot be undone.",
              () => {
                change((s) => ({ ...s, draft: null, timer: null }));
                go("train");
              },
            )
          }
        >
          Discard session
        </Button>{" "}
      </>
    );
  }
  function start(w?: D.Workout, p?: D.Program, prepared?: D.Entry[]) {
    if (s.draft) {
      go("session");
      setNotice(
        "Your active session is ready to resume. Complete or discard it before starting another.",
      );
      return;
    }
    if (p && D.programPhase(p) === "active-rest") {
      setModal({
        title: "Active rest",
        content: (
          <div className="training-coaching">
            <p>
              No hard workout is started in active rest. This program is paused
              for lifting; take time off or choose easy activity without a
              hard-set target.
            </p>
            <p>
              To resume programmed lifting, explicitly edit the phase and save
              your mesocycle. Completed history stays unchanged.
            </p>
            <Button onClick={() => editProgram(p)}>Review phase</Button>
          </div>
        ),
      });
      return;
    }
    const entries =
      prepared ??
      (w && p
        ? D.prepareWorkout(w, p, exercises, s.sessions, s.profile?.experience)
        : (w?.exercises ?? []).flatMap((t) => {
            const ex = exercises.find((e) => e.id === t.exerciseId);
            return ex ? [D.createEntry(ex, t)] : [];
          }));
    change((s) => ({
      ...s,
      draft: {
        ...D.startSession(w?.name || "Open session", entries, p, w),
        bodyweight: s.coaching?.bodyweight,
      },
      timer: null,
    }));
    go("session");
  }
  function sessionDetail(sess: D.Session) {
    setModal({
      title: "Workout recap",
      footer: (
        <Button variant="primary wide" onClick={close}>
          Done
        </Button>
      ),
      content: (
        <HistoryDetail
          session={sess}
          exercises={exercises}
          unit={s.settings.unit}
          edit={() => {
            close();
            setModal({
              title: "Edit logged session",
              content: (
                <HistoryEditor
                  session={sess}
                  exercises={exercises}
                  unit={s.settings.unit}
                  save={async (edited) => {
                    if (
                      await saveChange((s) => ({
                        ...s,
                        coachingEvents: [
                          ...(s.coachingEvents ?? []),
                          ...classifyCoachingOutcomes(s, edited),
                        ],
                        sessions: s.sessions.map((x) =>
                          x.id === edited.id ? edited : x,
                        ),
                      }))
                    ) {
                      close();
                      setNotice("Journal updated.");
                    }
                  }}
                />
              ),
            });
          }}
          deleteSession={() => {
            close();
            confirm(
              "Delete this session?",
              "This permanently removes its sets and recalculates your insights. Export a backup if you want a copy.",
              () =>
                change((s) => ({
                  ...s,
                  sessions: s.sessions.filter((x) => x.id !== sess.id),
                })),
            );
          }}
        />
      ),
    });
  }
  function finish() {
    const draft = s.draft!;
    const count = draft.exercises
      .flatMap((e) => e.sets)
      .filter((x) => x.done).length;
    if (!count) {
      setNotice("Complete at least one set before saving your session.");
      return;
    }
    setModal({
      title: "Review workout",
      content: (
        <FinishSessionFeedback
          draft={draft}
          history={s.sessions}
          exercises={exercises}
          unit={s.settings.unit}
          finish={async (
            feedback,
            muscleFeedback,
            confirmEffort,
            contexts,
            reviewed,
          ) => {
            const actual = reviewed ?? draft;
            const logged = D.completeSession({
              ...actual,
              feedback,
              muscleFeedback,
              exercises: actual.exercises.map((e) => ({
                ...e,
                coachingContext: contexts[e.id] ?? e.coachingContext,
                sets: e.sets.map((t) =>
                  confirmEffort && t.done ? { ...t, effortReported: true } : t,
                ),
              })),
              duration: Math.min(
                86400,
                Math.max(0, (Date.now() - draft.startedAt) / 1000),
              ),
            });
            if (
              await saveChange((s) => {
                if (JSON.stringify(s.draft) !== JSON.stringify(draft))
                  throw Error(
                    "The active workout changed. Reopen its review before saving.",
                  );
                return {
                  ...s,
                  sessions: [...s.sessions, logged],
                  coachingEvents: [
                    ...(s.coachingEvents ?? []),
                    ...classifyCoachingOutcomes(s, logged),
                  ],
                  draft: null,
                  timer: null,
                };
              })
            ) {
              close();
              go("train");
              if (s.settings.celebrations !== false) {
                const before = rewards(
                    s.sessions,
                    exercises,
                    weekMonday(),
                    s.profile?.days ?? 4,
                  ),
                  after = rewards(
                    [...s.sessions, logged],
                    exercises,
                    weekMonday(),
                    s.profile?.days ?? 4,
                  );
                setCelebration({
                  session: logged,
                  xp: Math.max(0, after.xp - before.xp),
                });
                if (s.settings.celebrationSound) feedbackTone(true);
              }
            } else
              throw Error(
                "Workout is not yet saved. Check device storage and try again.",
              );
          }}
        />
      ),
    });
  }
  if (!store.ready)
    return (
      <main className="loading">
        <Brand />
        <p>Opening your workspace…</p>
      </main>
    );
  if (!store.user && store.accessMode === "single-user-local")
    return (
      <main className="loading">
        <Brand />
        <h1>Single-user / this PC</h1>
        <p role="alert">
          {store.error ||
            "Local setup required. Check SINGLE_USER_ID and restart the local server."}
        </p>
        <p>
          Your existing account and pending device changes have not been
          removed.
        </p>
        <Button onClick={() => void initialize()}>Retry local setup</Button>
      </main>
    );
  if (!store.user) return <Auth />;
  if (!s.profile) return <Onboarding />;
  const thisWeek = new Date();
  thisWeek.setHours(0, 0, 0, 0);
  thisWeek.setDate(thisWeek.getDate() - ((thisWeek.getDay() + 6) % 7));
  const seconds = D.restRemaining(s.timer, Date.now());
  const title =
    page === "overview"
      ? "Your workspace"
      : page === "train"
        ? "Training studio"
        : page === "session"
          ? "Active session"
          : page === "history"
            ? "Training journal"
            : page === "insights"
              ? "Training insights"
              : page === "settings"
                ? "Your preferences"
                : "Exercise library";
  return (
    <div className={"app-shell page-" + page}>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Brand />
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map(([p, label, Icon]) => (
            <button
              key={p}
              className={
                page === p || (p === "train" && page === "session")
                  ? "nav-item active"
                  : "nav-item"
              }
              onClick={() => (p === "create" ? createMenu() : go(p))}
            >
              <Icon size={20} />
              <span>{label}</span>
              {p === "train" && s.draft && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private">
            <ShieldCheck size={18} />
            <span>
              {store.accessMode === "public-workspace"
                ? "Public shared workspace"
                : "Private by default"}
              <small>Built around your training.</small>
            </span>
          </div>
          <div className="account">
            <span className="avatar">
              {s.profile.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <b>{s.profile.name}</b>
              <small>{s.profile.experience} lifter</small>
            </div>
            {!store.user.accessMode && (
              <button
                aria-label="Sign out"
                className="icon-button"
                onClick={() => void logout().catch((e) => setNotice(e.message))}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <b>{title}</b>
          </span>
          <div className="topbar-actions">
            <button
              className={
                "sync-status " +
                (store.box.dirty || store.conflict ? "pending" : "")
              }
              onClick={() => void sync()}
              title="Check for changes"
            >
              <i />
              {store.status}
            </button>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() =>
                change((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    theme: s.settings.theme === "dark" ? "light" : "dark",
                  },
                }))
              }
            >
              {s.settings.theme === "dark" ? (
                <Sun size={19} />
              ) : (
                <Moon size={19} />
              )}
            </button>
            <button
              className="icon-button mobile-settings"
              aria-label="Settings"
              onClick={() => go("settings")}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        <main className="workspace" id="main-content" tabIndex={-1}>
          {store.accessMode === "public-workspace" && <PublicWorkspaceNotice />}
          {store.error && (
            <div className="banner error" role="alert">
              {store.error}
              {store.status === "Sign in again to sync" ||
              store.status.startsWith("Account changed") ? (
                store.accessMode === "public-workspace" ? (
                  <Button onClick={() => void initialize()}>
                    Reopen workspace
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      setModal({
                        title: "Restore account access",
                        content: (
                          <Reauthenticate
                            email={store.user!.email || ""}
                            close={close}
                          />
                        ),
                      })
                    }
                  >
                    Sign in to sync
                  </Button>
                )
              ) : (
                <Button onClick={() => void sync()}>Retry sync</Button>
              )}
            </div>
          )}
          {s.timer && !s.timer.paused && tick >= s.timer.endAt && (
            <div className="rest-finished-banner" role="status">
              <b>Rest finished</b>
              <span>Start when you’re ready.</span>
              <button
                className="btn"
                onClick={() => change((d) => ({ ...d, timer: null }))}
              >
                Ready
              </button>
            </div>
          )}
          {celebration && (
            <WorkoutCelebration
              session={celebration.session}
              recap={() => {
                setCelebration(null);
                sessionDetail(celebration.session);
              }}
              goal={s.profile?.days ?? 4}
              xp={celebration.xp}
              exercises={exercises}
              history={s.sessions}
              close={() => setCelebration(null)}
            />
          )}
          {notice && (
            <div className="banner" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {store.conflict && (
            <section className="panel conflict" role="alert">
              <p className="eyebrow">MULTI-DEVICE CONFLICT</p>
              <h2>Both devices made changes.</h2>
              <p>
                This device has {s.sessions.length} sessions. The cloud has{" "}
                {store.conflict.data.sessions.length} sessions at revision{" "}
                {store.conflict.revision}. Your local copy is preserved until
                you choose. Export both copies before replacing.
              </p>
              <div className="actions wrap">
                <Button
                  onClick={async () =>
                    download(
                      "neoform-local.jsonl",
                      await exportHistoryBackup(s),
                      "application/json",
                    )
                  }
                >
                  Export this device
                </Button>
                <Button
                  onClick={async () =>
                    download(
                      "neoform-cloud.jsonl",
                      await exportHistoryBackup(store.conflict!.data),
                      "application/json",
                    )
                  }
                >
                  Export cloud
                </Button>
                <Button
                  onClick={() =>
                    confirm(
                      "Use cloud changes?",
                      "Replace this device snapshot with the cloud version. Local-only edits will be removed.",
                      () => resolveConflict("remote"),
                    )
                  }
                >
                  Use cloud
                </Button>
                <Button
                  onClick={() =>
                    confirm(
                      "Merge these versions?",
                      "Use the last shared revision to combine independent edits, additions and deletions. Competing edits to the same value or edit/delete conflicts are preserved for explicit replacement choices. Export both copies first.",
                      () => resolveConflict("merge"),
                    )
                  }
                >
                  Merge safe changes
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    confirm(
                      "Replace cloud with this device?",
                      "Explicitly overwrite the displayed cloud revision. Changes on another device will be replaced. A newer cloud revision will trigger another conflict.",
                      () => resolveConflict("local"),
                    )
                  }
                >
                  Replace cloud
                </Button>
              </div>
            </section>
          )}
          {page === "overview" && (
            <WorkoutDashboard
              state={s}
              exercises={exercises}
              history={() => go("history")}
              detail={sessionDetail}
              progress={() => go("insights")}
              weight={() =>
                setModal({
                  title: "Bodyweight & coaching preferences",
                  content: <CoachSettingsPanel />,
                })
              }
              review={() =>
                setModal({ title: "Weekly review", content: <WeeklyReview /> })
              }
            />
          )}
          {page === "train" && (
            <WorkoutHome
              state={s}
              reviewProgram={(p) =>
                setModal({
                  title: "Program review",
                  content: (
                    <ProgramReviewSheet
                      programId={p.id}
                      openTargets={(session, entryId) =>
                        setModal({
                          title: "Program targets",
                          content: (
                            <CoachSheet
                              session={session}
                              entryId={entryId}
                              programOnly
                            />
                          ),
                        })
                      }
                    />
                  ),
                })
              }
              start={(w, p) => {
                if (!w || !p) {
                  start(w, p);
                  return;
                }
                if (s.draft) {
                  start();
                  return;
                }
                setModal({
                  title: w.name,
                  presentation: "screen",
                  content: (
                    <WorkoutPreview
                      workout={w}
                      program={p}
                      state={s}
                      exercises={exercises}
                      start={(rows) => {
                        close();
                        start(w, p, rows);
                      }}
                    />
                  ),
                });
              }}
              edit={editProgram}
              create={createMenu}
              history={() => go("history")}
              library={() => go("exercises")}
              detail={sessionDetail}
              coach={(w, p) =>
                setModal({
                  title: "Next workout coach",
                  content: (
                    <CoachSheet
                      session={
                        s.draft ??
                        D.startSession(
                          w.name,
                          D.prepareWorkout(
                            w,
                            p,
                            exercises,
                            s.sessions,
                            s.profile?.experience,
                          ),
                          p,
                          w,
                        )
                      }
                      onOpenWorkout={() => {
                        close();
                        go("session");
                      }}
                    />
                  ),
                })
              }
            />
          )}
          {page === "session" &&
            (s.draft ? (
              <>
                <header className="session-bar">
                  <button
                    className="icon-button"
                    aria-label="Session options"
                    onClick={() =>
                      setModal({
                        title: "Session options",
                        content: <SessionOptions />,
                      })
                    }
                  >
                    <MoreHorizontal size={21} />
                  </button>
                  <span aria-label="Workout duration">
                    {duration(Math.max(0, (tick - s.draft.startedAt) / 1000))}
                  </span>
                  <button
                    className="slim-rest"
                    aria-label="Rest timer controls"
                    aria-description={
                      s.timer?.paused
                        ? "Rest timer paused"
                        : s.timer && seconds === 0
                          ? "Rest timer finished. Start when ready."
                          : "Rest time remaining"
                    }
                    data-paused={s.timer?.paused || undefined}
                    onClick={() =>
                      setModal({ title: "Rest timer", content: <TimerSheet /> })
                    }
                  >
                    <Clock size={16} />
                    {s.timer && !s.timer.paused && seconds === 0
                      ? "Rest done"
                      : duration(seconds)}
                    {s.timer?.paused && <span aria-hidden="true">Ⅱ</span>}
                  </button>
                  <Button variant="primary" onClick={finish}>
                    Finish session
                  </Button>
                </header>
                <SessionLogger
                  session={s.draft}
                  exercises={exercises}
                  unit={s.settings.unit}
                  previous={s.sessions}
                  setSession={(draft) => change((s) => ({ ...s, draft }))}
                  remove={(title, fn) =>
                    confirm(
                      title,
                      "This removes the item from your active draft. Completed history stays in your journal.",
                      fn,
                    )
                  }
                  onDone={(setId, entry) => {
                    unlockFeedbackAudio();
                    const timerId = D.uid();
                    claimRestTimer(timerId);
                    const draft = D.toggleSet(s.draft!, setId);
                    const set = draft.exercises
                      .flatMap((e) => e.sets)
                      .find((t) => t.id === setId)!;
                    const rest =
                      set.prescription?.rest ?? entry.target?.rest ?? 120;
                    change((s) => ({
                      ...s,
                      draft,
                      timer: set.done
                        ? {
                            id: timerId,
                            setId,
                            endAt: Date.now() + rest * 1000,
                            remaining: rest,
                            paused: false,
                          }
                        : s.timer?.setId === setId
                          ? null
                          : s.timer,
                    }));
                  }}
                />
                <div className="actions wrap">
                  <Button
                    onClick={() =>
                      pick((e) =>
                        change((s) => ({
                          ...s,
                          draft: {
                            ...s.draft!,
                            exercises: [
                              ...s.draft!.exercises,
                              D.createEntry(e),
                            ],
                          },
                        })),
                      )
                    }
                  >
                    <Plus size={18} />
                    Add exercise
                  </Button>
                </div>
              </>
            ) : (
              <Empty
                title="A fresh page for your next session."
                action={
                  <Button variant="primary" onClick={() => start()}>
                    Start an open workout
                  </Button>
                }
              >
                Start from a program, or add your own exercises as you go.
              </Empty>
            ))}
          {page === "history" && (
            <History
              sessions={s.sessions}
              exercises={exercises}
              detail={sessionDetail}
              backfill={() =>
                setModal({
                  title: "Add a past workout",
                  content: (
                    <HistoryEditor
                      session={D.startSession("Past workout", [])}
                      exercises={exercises}
                      unit={s.settings.unit}
                      save={async (logged) => {
                        if (
                          !logged.exercises.some((e) =>
                            e.sets.some((t) => t.done),
                          )
                        ) {
                          setNotice("Add at least one completed set.");
                          return;
                        }
                        if (
                          await saveChange((s) => ({
                            ...s,
                            sessions: [
                              ...s.sessions,
                              D.completeSession(logged),
                            ],
                          }))
                        )
                          close();
                      }}
                    />
                  ),
                })
              }
            />
          )}
          {page === "exercises" && (
            <>
              <PageHeading
                eyebrow="KNOW YOUR MOVEMENTS"
                title="Exercise library"
                text="Search movements, cues and training history."
                action={
                  <Button
                    variant="primary"
                    onClick={() =>
                      setModal({
                        title: "Create an exercise",
                        content: (
                          <ExerciseEditor
                            exercise={D.catalog[0]}
                            isNew
                            save={async (ex) => {
                              if (
                                await saveChange((s) => ({
                                  ...s,
                                  customExercises: [...s.customExercises, ex],
                                }))
                              )
                                close();
                            }}
                          />
                        ),
                      })
                    }
                  >
                    <Plus size={18} />
                    Custom exercise
                  </Button>
                }
              />
              <ExercisePicker
                exercises={exercises}
                browse
                onPick={(ex) =>
                  setModal({
                    title: ex.name,
                    content: (
                      <>
                        <VideoInfo exercise={ex} />
                        <span className="tag">
                          {ex.muscle} · {ex.equipment}
                        </span>
                        <p>{ex.instructions}</p>
                        <p>
                          <b>
                            Log{" "}
                            {D.conventionLabels[ex.convention].toLowerCase()}.
                          </b>{" "}
                          {ex.e1rm
                            ? "Epley estimate available for total barbell loads up to 12 reps."
                            : "No 1RM estimate: load labels and bodyweight are not comparable to total barbell load."}
                        </p>
                        <h3>Alternatives with the same direct muscle</h3>
                        <div className="chips">
                          {exercises
                            .filter(
                              (e) => e.id !== ex.id && e.muscle === ex.muscle,
                            )
                            .map((e) => (
                              <span className="tag" key={e.id}>
                                {e.name} · {e.equipment}
                              </span>
                            ))}
                        </div>
                        {s.customExercises.some((e) => e.id === ex.id) && (
                          <Button
                            onClick={() =>
                              setModal({
                                title: "Edit custom exercise",
                                content: (
                                  <ExerciseEditor
                                    exercise={ex}
                                    isNew={false}
                                    save={async (edited) => {
                                      if (
                                        await saveChange((s) => ({
                                          ...s,
                                          customExercises:
                                            s.customExercises.map((e) =>
                                              e.id === edited.id ? edited : e,
                                            ),
                                        }))
                                      )
                                        close();
                                    }}
                                  />
                                ),
                              })
                            }
                          >
                            Edit exercise
                          </Button>
                        )}
                      </>
                    ),
                  })
                }
              />
            </>
          )}
          {page === "insights" && (
            <Levels
              state={s}
              exercises={exercises}
              insights={
                <Insights
                  state={s}
                  exercises={exercises}
                  weekStart={thisWeek}
                  onReviewProgram={editProgram}
                  onApplyDeload={(p) =>
                    confirm(
                      "Accept a deload?",
                      `Set ${p.name} to deload. New workouts use the conservative reduced set/rep dose and easier effort shown in the program preview. Existing drafts and completed history stay unchanged.`,
                      () =>
                        change((s) => ({
                          ...s,
                          programs: s.programs.map((x) =>
                            x.id === p.id
                              ? {
                                  ...x,
                                  currentWeek: x.deloadWeek,
                                  phase: "deload" as const,
                                }
                              : x,
                          ),
                        })),
                    )
                  }
                />
              }
            />
          )}
          {page === "settings" && (
            <Preferences
              state={s}
              onLibrary={() => go("exercises")}
              onHistory={() => go("history")}
              userEmail={store.user.email || ""}
              setNotice={setNotice}
              confirm={confirm}
              open={setModal}
              close={close}
            />
          )}
          <footer className="workspace-footer">
            <span>NEOFORM / INTENTIONAL TRAINING</span>
            <span>Your effort. Your record.</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map(([p, label, Icon]) => (
          <button
            key={p}
            aria-label={label}
            className={
              (p === "create" ? "create-tab " : "") +
              (page === p || (p === "train" && page === "session")
                ? "active"
                : "")
            }
            onClick={() => (p === "create" ? createMenu() : go(p))}
          >
            <Icon size={22} />
            <span>{p === "create" ? "" : label}</span>
          </button>
        ))}
      </nav>
      {s.timer && (
        <div className="rest-timer" role="region" aria-label="Rest timer">
          <Clock size={18} />
          <div>
            <small>
              {seconds <= 0
                ? "READY WHEN YOU ARE"
                : s.timer.paused
                  ? "REST PAUSED"
                  : "RECOVER & RESET"}
            </small>
            <b>{duration(seconds)}</b>
          </div>
          <button
            className="icon-button"
            aria-label={s.timer.paused ? "Resume rest" : "Pause rest"}
            onClick={() =>
              change((s) => ({
                ...s,
                timer: s.timer
                  ? {
                      ...s.timer,
                      paused: !s.timer.paused,
                      remaining: seconds,
                      endAt: Date.now() + seconds * 1000,
                    }
                  : null,
              }))
            }
          >
            {s.timer.paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button
            className="timer-add"
            onClick={() =>
              change((s) => ({
                ...s,
                timer: s.timer
                  ? {
                      ...s.timer,
                      remaining: Math.min(3600, seconds + 30),
                      endAt: Date.now() + Math.min(3600, seconds + 30) * 1000,
                    }
                  : null,
              }))
            }
          >
            +30s
          </button>
          <button
            className="icon-button"
            aria-label="Skip rest"
            onClick={() => change((s) => ({ ...s, timer: null }))}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={modal.title}
          close={close}
          footer={modal.footer}
          presentation={modal.presentation}
        >
          {modal.content}
        </Modal>
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat">
      <p className="eyebrow">{label}</p>
      <b>{value}</b>
      <span>{detail}</span>
    </div>
  );
}
function SessionRow({
  session: s,
  onClick,
}: {
  session: D.Session;
  onClick: () => void;
}) {
  return (
    <button className="session-row" onClick={onClick}>
      <span className="session-icon">
        <Dumbbell size={20} />
      </span>
      <span className="session-row-title">
        <b>{s.name}</b>
        <small>
          {s.exercises.length} exercises ·{" "}
          {
            s.exercises
              .flatMap((e) => e.sets)
              .filter((t) => t.done && t.kind !== "warmup").length
          }{" "}
          working/drop sets · {Math.round(s.duration / 60)} min
        </small>
      </span>
      <span className="session-date">{niceDate(s.date)}</span>
      <ChevronRight size={17} />
    </button>
  );
}
function VolumeBars({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return entries.length ? (
    <div className="volume-bars">
      {entries.map(([muscle, n]) => (
        <div key={muscle}>
          <div>
            <span>{muscle}</span>
            <b>
              {n} <small>sets</small>
            </b>
          </div>
          <div className="bar-track">
            <span
              style={{
                width: `${(n / Math.max(10, ...Object.values(values))) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="empty-caption">
      Your muscle volume will appear after logging hard working sets.
    </p>
  );
}
function ExerciseEditor({
  exercise,
  isNew,
  save,
}: {
  exercise: D.Exercise;
  isNew: boolean;
  save: (e: D.Exercise) => void;
}) {
  const [ex, setEx] = useState<D.Exercise>(
      isNew
        ? {
            ...exercise,
            id: "custom-" + D.uid(),
            name: "",
            instructions: "",
            e1rm: false,
            secondary: [],
          }
        : structuredClone(exercise),
    ),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = D.exerciseSchema.safeParse(ex);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        save(parsed.data);
      }}
    >
      <Field label="Exercise name">
        <input
          required
          value={ex.name}
          maxLength={120}
          onChange={(e) => setEx({ ...ex, name: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        {(["muscle", "equipment", "pattern", "convention"] as const).map(
          (key, i) => (
            <Field
              label={
                [
                  "Direct muscle",
                  "Equipment",
                  "Movement pattern",
                  "Load convention",
                ][i]
              }
              key={key}
            >
              <select
                value={ex[key]}
                disabled={
                  !isNew &&
                  (key === "convention" ||
                    key === "equipment" ||
                    key === "muscle")
                }
                onChange={(e) => setEx({ ...ex, [key]: e.target.value })}
              >
                {[D.muscles, D.equipment, D.patterns, D.conventions][i].map(
                  (x) => (
                    <option key={x} value={x}>
                      {D.conventionLabels[x] || x}
                    </option>
                  ),
                )}
              </select>
            </Field>
          ),
        )}
      </div>
      <Field label="Instructions / setup notes">
        <textarea
          value={ex.instructions}
          maxLength={2000}
          onChange={(e) => setEx({ ...ex, instructions: e.target.value })}
        />
      </Field>
      <p className="caption">
        Equipment, direct muscle and load convention are fixed after creation to
        preserve comparable history. Create another exercise for a different
        machine or convention. Custom exercises do not receive a 1RM estimate.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary">
        Save exercise
      </Button>
    </form>
  );
}
function History({
  sessions,
  exercises,
  detail,
  backfill,
}: {
  sessions: D.Session[];
  exercises: D.Exercise[];
  detail: (s: D.Session) => void;
  backfill: () => void;
}) {
  const [q, setQ] = useState(
      () => localStorage.getItem("neoform:history-q") || "",
    ),
    [muscle, setMuscle] = useState(
      () => localStorage.getItem("neoform:history-muscle") || "",
    ),
    [from, setFrom] = useState(
      () => localStorage.getItem("neoform:history-from") || "",
    );
  const filtered = [...sessions]
    .filter(
      (s) =>
        (s.name + " " + s.notes).toLowerCase().includes(q.toLowerCase()) &&
        (!from || s.date >= from) &&
        (!muscle ||
          s.exercises.some(
            (e) =>
              exercises.find((x) => x.id === e.exerciseId)?.muscle === muscle,
          )),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
  return (
    <>
      <PageHeading
        eyebrow="YOUR RECORD OF THE WORK"
        title="Workout history"
        text="Your completed workouts."
        action={
          <Button onClick={backfill}>
            <Plus size={18} />
            Add past workout
          </Button>
        }
      />
      <div className="filter-row">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search journal"
            placeholder="Search sessions or notes…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              localStorage.setItem("neoform:history-q", e.target.value);
            }}
          />
        </label>
        <select
          aria-label="Journal muscle filter"
          value={muscle}
          onChange={(e) => {
            setMuscle(e.target.value);
            localStorage.setItem("neoform:history-muscle", e.target.value);
          }}
        >
          <option value="">All muscles</option>
          {D.muscles.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          aria-label="Journal from date"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            localStorage.setItem("neoform:history-from", e.target.value);
          }}
        />
      </div>
      <p className="caption">{filtered.length} sessions shown</p>
      <section className="panel">
        {filtered.length ? (
          filtered.map((s) => (
            <SessionRow key={s.id} session={s} onClick={() => detail(s)} />
          ))
        ) : (
          <Empty
            title={
              sessions.length
                ? "No matching sessions."
                : "The work starts here."
            }
          >
            Your completed workouts will appear here. You can also backfill
            earlier training.
          </Empty>
        )}
      </section>
    </>
  );
}
function HistoryDetail({
  session: s,
  exercises,
  unit,
  edit,
  deleteSession,
}: {
  session: D.Session;
  exercises: D.Exercise[];
  unit: "kg" | "lb";
  edit: () => void;
  deleteSession: () => void;
}) {
  const working = s.exercises
    .flatMap((e) => e.sets)
    .filter((t) => t.done && t.kind !== "warmup");
  return (
    <>
      <WorkoutRecap session={s} exercises={exercises} unit={unit} />
      <details className="recap-details">
        <summary>Workout details</summary>
        <p className="eyebrow">
          {niceDate(s.date)} · {Math.round(s.duration / 60)} MINUTES
        </p>
        <h2>{s.name}</h2>
        <div className="summary-grid">
          <Stat
            label="RAW WORK BOUTS"
            value={String(working.length)}
            detail="Completed only"
          />
          <Stat
            label="HARD SETS"
            value={String(
              Object.values(D.directVolume([s], exercises)).reduce(
                (a, b) => a + b,
                0,
              ),
            )}
            detail="Straight/down sets, ≤4 RIR; advanced bouts separate"
          />
        </div>
        {s.exercises.map((e) => (
          <div className="history-exercise" key={e.id}>
            <h3>{exercises.find((x) => x.id === e.exerciseId)?.name}</h3>
            <p className="caption">
              {e.equipment ||
                exercises.find((x) => x.id === e.exerciseId)?.equipment}{" "}
              ·{" "}
              {
                D.conventionLabels[
                  e.convention ||
                    exercises.find((x) => x.id === e.exerciseId)!.convention
                ]
              }
            </p>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Logged sets</caption>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>
                      {(e.convention ||
                        exercises.find((x) => x.id === e.exerciseId)!
                          .convention) === "machine-label"
                        ? "Machine label"
                        : `Load (${unit})`}
                    </th>
                    <th>Reps</th>
                    <th>RIR</th>
                  </tr>
                </thead>
                <tbody>
                  {e.sets.map((t) => (
                    <tr key={t.id}>
                      <td>{t.kind}</td>
                      <td>
                        {fmt(
                          D.displayLoad(
                            t.weight,
                            e.convention ||
                              exercises.find((x) => x.id === e.exerciseId)!
                                .convention,
                            unit,
                          ),
                        )}
                      </td>
                      <td>{t.reps}</td>
                      <td>{t.effortReported === false ? "Unknown" : t.rir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {e.notes && <p>{e.notes}</p>}
          </div>
        ))}
        <p>{s.notes || "No session notes."}</p>
        <FeedbackSummary session={s} />
        <p className="caption">
          Records and trends are recalculated from all logged sessions in
          Insights. Warmups are excluded.
        </p>
      </details>
      <div className="actions wrap">
        <Button variant="primary" onClick={edit}>
          Edit session
        </Button>
        <Button
          onClick={() =>
            download(
              "neoform-session.csv",
              D.csvSessions([s], exercises),
              "text/csv",
            )
          }
        >
          Export CSV
        </Button>
        <Button variant="danger" onClick={deleteSession}>
          Delete
        </Button>
      </div>
    </>
  );
}
function HistoryEditor({
  session,
  exercises,
  unit,
  save,
}: {
  session: D.Session;
  exercises: D.Exercise[];
  unit: "kg" | "lb";
  save: (s: D.Session) => void;
}) {
  const [s, setS] = useState(structuredClone(session)),
    [error, setError] = useState(""),
    [add, setAdd] = useState(exercises[0].id),
    [removeItem, setRemoveItem] = useState<{
      title: string;
      fn: () => void;
    } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = D.sessionSchema.safeParse(s);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        if (!s.exercises.some((e) => e.sets.some((t) => t.done))) {
          setError("At least one completed set is required.");
          return;
        }
        save(D.completeSession(parsed.data));
      }}
    >
      <Field label="Session name">
        <input
          required
          value={s.name}
          maxLength={120}
          onChange={(e) => setS({ ...s, name: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Workout date">
          <input
            required
            type="date"
            value={s.date}
            max={D.today()}
            onChange={(e) => setS({ ...s, date: e.target.value })}
          />
        </Field>
        <Field label="Duration (minutes)">
          <Num
            label="Duration (minutes)"
            value={s.duration / 60}
            max={1440}
            step={0.1}
            onChange={(n) => setS({ ...s, duration: n * 60 })}
          />
        </Field>
      </div>
      <SessionLogger
        session={s}
        exercises={exercises}
        unit={unit}
        setSession={setS}
        history
        remove={(title, fn) => setRemoveItem({ title, fn })}
      />
      {removeItem && (
        <div className="banner">
          <span>{removeItem.title}</span>
          <Button onClick={() => setRemoveItem(null)}>Keep</Button>
          <Button
            variant="danger"
            onClick={() => {
              removeItem.fn();
              setRemoveItem(null);
            }}
          >
            Remove
          </Button>
        </div>
      )}
      <div className="form-grid">
        <Field label="Add exercise">
          <select value={add} onChange={(e) => setAdd(e.target.value)}>
            {exercises.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Button
          onClick={() => {
            const entry = D.createEntry(exercises.find((x) => x.id === add)!);
            setS({
              ...s,
              exercises: [
                ...s.exercises,
                {
                  ...entry,
                  sets: entry.sets.map((t) => ({ ...t, done: true })),
                },
              ],
            });
          }}
        >
          <Plus size={18} />
          Add to session
        </Button>
      </div>
      <Field label="Session notes">
        <textarea
          value={s.notes}
          maxLength={2000}
          onChange={(e) => setS({ ...s, notes: e.target.value })}
        />
      </Field>
      <SessionFeedbackFields
        value={s.feedback}
        onChange={(feedback) => setS({ ...s, feedback })}
      />
      <MuscleFeedbackFields
        value={s.muscleFeedback ?? []}
        onChange={(muscleFeedback) => setS({ ...s, muscleFeedback })}
        muscles={[
          ...new Set(
            s.exercises.flatMap((entry) => {
              const ex = exercises.find((ex) => ex.id === entry.exerciseId);
              return ex ? [ex.muscle, ...ex.secondary] : [];
            }),
          ),
        ]}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-sticky">
        <Button type="submit" variant="primary wide">
          Save journal changes
        </Button>
      </div>
    </form>
  );
}
function Insights({
  state: s,
  exercises,
  weekStart,
  onReviewProgram,
  onApplyDeload,
}: {
  state: D.State;
  exercises: D.Exercise[];
  weekStart: Date;
  onReviewProgram: (p: D.Program) => void;
  onApplyDeload: (p: D.Program) => void;
}) {
  const [selected, setSelected] = useState(""),
    [monthOffset, setMonthOffset] = useState(0);
  const displayUnit = s.settings.unit;
  const loggedExercises = exercises.filter((ex) =>
    s.sessions.some((s) => s.exercises.some((e) => e.exerciseId === ex.id)),
  );
  const ex = exercises.find(
    (x) => x.id === (selected || loggedExercises[0]?.id),
  );
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() - (7 - i) * 7);
    const end = new Date(date);
    end.setDate(end.getDate() + 7);
    const sessions = s.sessions.filter(
      (s) =>
        new Date(s.date + "T12:00:00") >= date &&
        new Date(s.date + "T12:00:00") < end,
    );
    return {
      label: niceDate(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      ),
      value: Object.values(D.directVolume(sessions, exercises)).reduce(
        (a, b) => a + b,
        0,
      ),
      sessions: sessions.length,
    };
  });
  const performance = ex
    ? D.performanceTimeline(ex.id, s.sessions, exercises).map((point) => ({
        label: niceDate(point.date),
        reps: point.reps,
        context: point.context,
        value: D.displayLoad(point.weight, ex.convention, displayUnit),
      }))
    : [];
  const reviewProgram = s.programs.find((p) => !p.archived);
  const reviewWorkout = reviewProgram?.workouts.find((w) =>
    w.exercises.some((t) => t.exerciseId === ex?.id),
  );
  const reviewEntry =
    reviewProgram && reviewWorkout
      ? D.prepareWorkout(
          reviewWorkout,
          reviewProgram,
          exercises,
          s.sessions,
          s.profile?.experience,
        ).find((e) => e.exerciseId === ex?.id)
      : undefined;
  const reviewRange =
    reviewEntry?.target ??
    [...s.sessions]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
      .flatMap((s) => s.exercises)
      .filter((e) => e.exerciseId === ex?.id)
      .at(-1)?.target;
  const reviewSession =
    reviewProgram && reviewWorkout
      ? D.startSession(
          reviewWorkout.name,
          D.prepareWorkout(
            reviewWorkout,
            reviewProgram,
            exercises,
            s.sessions,
            s.profile?.experience,
          ),
          reviewProgram,
          reviewWorkout,
        )
      : undefined;
  if (reviewSession) reviewSession.readiness = s.draft?.readiness;
  const rec =
    ex && reviewSession
      ? asRecommendation(
          evaluateCoaching(s, reviewSession).find(
            (p) => p.exerciseId === ex.id,
          ),
        )
      : null;
  const recs = D.records(s.sessions, exercises);
  const latest = [...s.sessions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
  )[0];
  const month = new Date();
  month.setMonth(month.getMonth() + monthOffset, 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-`;
  return (
    <>
      <PageHeading
        eyebrow="EVIDENCE, OVER GUESSWORK"
        title="Training insights"
        text="Performance, exposure and recovery details."
      />
      <MuscleReview
        sessions={s.sessions}
        exercises={exercises}
        experience={s.profile?.experience}
        program={s.programs.find((p) => !p.archived)}
        readiness={s.draft?.readiness}
        onReviewProgram={onReviewProgram}
      />
      <div className="stat-grid">
        <Stat
          label="TOTAL SESSIONS"
          value={String(s.sessions.length)}
          detail="In your journal"
        />
        <Stat
          label="TIME INVESTED"
          value={fmt(s.sessions.reduce((n, x) => n + x.duration, 0) / 3600)}
          detail="Hours logged"
        />
        <Stat
          label="CONSISTENCY THIS WEEK"
          value={`${weeks.at(-1)!.sessions}/${s.profile!.days}`}
          detail="Logged / planned days"
        />
      </div>
      {!s.sessions.length && (
        <Empty title="Your insights begin with a session.">
          Training trends, direct muscle volume and comparable records will
          appear as you log.
        </Empty>
      )}
      <div className="dashboard-grid">
        <div className="stack">
          <section className="panel">
            <p className="eyebrow">8-WEEK TREND</p>
            <h2>Direct hard sets</h2>
            <Chart points={weeks} suffix="sets" />
            <details className="data-table">
              <summary>View chart data</summary>
              <table>
                <thead>
                  <tr>
                    <th>Week of</th>
                    <th>Sets</th>
                    <th>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((x) => (
                    <tr key={x.label}>
                      <td>{x.label}</td>
                      <td>{x.value}</td>
                      <td>{x.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="caption">
              Completed direct straight/down sets at ≤4 RIR. Advanced bouts and
              indirect involvement are shown separately below, never converted
              into equivalent growth sets. These are estimates, not personal
              volume landmarks.
            </p>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Exercise performance</h2>
              <select
                aria-label="Performance exercise"
                value={selected || loggedExercises[0]?.id || ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!loggedExercises.length && (
                  <option value="">No logged exercises</option>
                )}
                {loggedExercises.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            {ex && (
              <p className="caption">
                Raw completed-bout timeline—not a comparable strength trend.
                Method and phase differ; load and reps belong to the same bout.{" "}
                {ex.equipment} · {D.conventionLabels[ex.convention]} ·{" "}
                {ex.convention === "machine-label"
                  ? "raw label"
                  : s.settings.unit}
              </p>
            )}
            {performance.length ? (
              <>
                <Chart
                  points={performance.slice(-12)}
                  suffix={
                    ex?.convention === "machine-label"
                      ? "label"
                      : s.settings.unit
                  }
                />
                <details className="data-table performance-log">
                  <summary>View performance data</summary>
                  <table aria-label="Raw performance bouts">
                    <thead>
                      <tr>
                        <th>Date / method / phase</th>
                        <th>
                          Load (
                          {ex?.convention === "machine-label"
                            ? "label"
                            : s.settings.unit}
                          )
                        </th>
                        <th>Bout reps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.slice(-12).map((x, i) => (
                        <tr key={i}>
                          <td>
                            {x.label}
                            <small>{x.context}</small>
                          </td>
                          <td>{fmt(x.value)}</td>
                          <td>{x.reps}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <p className="empty-caption">
                Log working sets to see performance. Warmups and other
                conventions are excluded.
              </p>
            )}
            {rec && (
              <div className="coaching-note">
                <h3>
                  {rec.action === "recover"
                    ? "Make space for recovery."
                    : rec.action === "load"
                      ? "A small load increase is available."
                      : rec.action === "reps"
                        ? "Build within your rep range."
                        : "Keep gathering good data."}
                </h3>
                <p>{rec.reason}</p>
                <DecisionEvidence decision={rec} />
                {rec.weight !== undefined && !rec.setTargets && (
                  <p>
                    {fmt(
                      D.displayLoad(
                        rec.weight,
                        ex!.convention,
                        s.settings.unit,
                      ),
                    )}{" "}
                    {ex?.convention === "machine-label"
                      ? "label"
                      : s.settings.unit}{" "}
                    × {rec.reps} reps · review against your {reviewRange?.min}–
                    {reviewRange?.max} rep range
                  </p>
                )}
                {rec.setTargets && (
                  <p>
                    Working-set targets:{" "}
                    {rec.setTargets
                      .map(
                        (t) =>
                          `${fmt(D.displayLoad(t.weight, ex!.convention, displayUnit))} × ${t.reps}`,
                      )
                      .join(" / ")}{" "}
                    {ex?.convention === "machine-label" ? "label" : displayUnit}
                    .
                  </p>
                )}
                <p className="caption">
                  Apply suggestions through “Accept for unlogged sets” in an
                  active workout. No automatic program or load changes.
                </p>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Comparable records</h2>
            <p className="caption">
              Best raw load, then reps at that load, separated by exercise,
              equipment, convention, method/bout, semantic pair protocol and
              recorded phase. Legacy unknown pairs are not assumed comparable.
              Advanced-sequence progression stays manual. No warmups. Epley e1RM
              is shown only for qualifying straight total-barbell work; it is an
              estimate, not a tested maximum.
            </p>
            {recs.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Movement / convention</th>
                      <th>Best set</th>
                      <th>e1RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recs.map((r) => (
                      <tr key={r.key}>
                        <td>
                          {r.name}
                          <small>
                            {r.equipment} · {D.conventionLabels[r.convention]} ·{" "}
                            {niceDate(r.date)}
                          </small>
                          <small>{r.context}</small>
                        </td>
                        <td>
                          {fmt(
                            D.displayLoad(
                              r.weight,
                              r.convention,
                              s.settings.unit,
                            ),
                          )}{" "}
                          × {r.reps}
                        </td>
                        <td>
                          {r.e1rm === null
                            ? "—"
                            : `${fmt(D.convertWeight(r.e1rm, "kg", s.settings.unit))} ${s.settings.unit}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-caption">
                Your first comparable records will appear here.
              </p>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <div className="section-heading">
              <h2>
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <div className="actions">
                <button
                  className="icon-button"
                  aria-label="Previous month"
                  onClick={() => setMonthOffset((x) => x - 1)}
                >
                  ‹
                </button>
                <button
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() => setMonthOffset((x) => x + 1)}
                >
                  ›
                </button>
              </div>
            </div>
            <div className="calendar" aria-label="Training calendar">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <small key={i}>{d}</small>
              ))}
              {Array.from({ length: (month.getDay() + 6) % 7 }, (_, i) => (
                <span key={"blank" + i} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const date = prefix + String(i + 1).padStart(2, "0"),
                  n = s.sessions.filter((s) => s.date === date).length;
                return (
                  <span
                    key={i}
                    className={n ? "trained" : ""}
                    title={`${date}: ${n} sessions`}
                    aria-label={`${date}: ${n} sessions`}
                  >
                    {i + 1}
                    {n > 0 && <i />}
                  </span>
                );
              })}
            </div>
            <p className="caption">Marked days contain logged sessions.</p>
          </section>
          <section className="panel">
            <h2>This week's muscle volume</h2>
            <TrainingExposure
              sessions={s.sessions.filter(
                (x) =>
                  new Date(x.date + "T12:00:00") >= weekStart &&
                  x.date <= D.today(),
              )}
              exercises={exercises}
            />
            <VolumeBars
              values={D.directVolume(
                s.sessions.filter(
                  (s) =>
                    new Date(s.date + "T12:00:00") >= weekStart &&
                    s.date <= D.today(),
                ),
                exercises,
              )}
            />
          </section>
          <section className="panel">
            <p className="eyebrow">RECOVERY CHECK-IN</p>
            <h2>
              {latest ? "Listen to the feedback." : "A little context helps."}
            </h2>
            {latest ? (
              <>
                <p>Last session · {niceDate(latest.date)}</p>
                <FeedbackSummary session={latest} />
                {(latest.feedback.pain === true ||
                  (latest.feedback.reported === true &&
                    ((latest.feedback.soreness != null &&
                      latest.feedback.soreness >= 4) ||
                      (latest.feedback.fatigue != null &&
                        latest.feedback.fatigue >= 4)))) && (
                  <>
                    <p>
                      Unscoped recovery signals need review. Local muscle
                      reports are reviewed separately above; they do not
                      automatically deload unrelated muscles. Persistent pain
                      needs qualified support.
                    </p>
                    {s.programs
                      .filter((p) => !p.archived)
                      .map((p) => (
                        <Button key={p.id} onClick={() => onApplyDeload(p)}>
                          Accept {p.name} deload
                        </Button>
                      ))}
                  </>
                )}
              </>
            ) : (
              <p>
                Record pump, soreness, fatigue and pain after training.
                Suggestions wait for enough comparable data.
              </p>
            )}
            <p className="caption">
              Original deterministic heuristics. Not proprietary RP/MacroFactor
              algorithms, a medical diagnosis, or a promise of results.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
function Chart({
  points,
  suffix,
}: {
  points: { label: string; value: number }[];
  suffix: string;
}) {
  const max = Math.max(1, ...points.map((x) => x.value));
  const pts = points.map((p, i) => ({
    x: 30 + i * (540 / Math.max(1, points.length - 1)),
    y: 165 - (p.value / max) * 135,
    ...p,
  }));
  return (
    <div className="chart">
      <svg
        viewBox="0 0 600 210"
        role="img"
        aria-label={points
          .map((p) => `${p.label}: ${fmt(p.value)} ${suffix}`)
          .join("; ")}
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="30"
              y1={165 - i * 45}
              x2="580"
              y2={165 - i * 45}
              className="gridline"
            />
            <text x="2" y={169 - i * 45}>
              {Math.round((max * i) / 3)}
            </text>
          </g>
        ))}
        {pts.length > 1 && (
          <>
            <path
              d={`M${pts[0].x},165 ${pts.map((p) => `L${p.x},${p.y}`).join(" ")} L${pts.at(-1)!.x},165 Z`}
              className="area"
            />
            <polyline
              pathLength="1"
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              className="trendline"
            />
          </>
        )}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" className="chart-point" />
            <text x={p.x} y="193" textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
function download(name: string, body: string | Blob, type: string) {
  const blob = body instanceof Blob ? body : new Blob([body], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Preferences({
  onLibrary,
  onHistory,
  state: s,
  userEmail,
  setNotice,
  confirm,
  open,
  close,
}: {
  onLibrary: () => void;
  onHistory: () => void;
  state: D.State;
  userEmail: string;
  setNotice: (s: string) => void;
  confirm: (title: string, text: string, fn: () => void) => void;
  open: (m: { title: string; content: ReactNode }) => void;
  close: () => void;
}) {
  const singleUser = useStore().user?.accessMode === "single-user-local";
  const publicWorkspace = useStore().accessMode === "public-workspace";
  const exercises = [...D.catalog, ...s.customExercises];
  return (
    <>
      <PageHeading
        eyebrow="NEOFORM"
        title="More"
        text="Your training, settings and data."
      />
      <div className="more-profile">
        <span className="avatar">{s.profile?.name?.slice(0, 1) || "N"}</span>
        <span>
          <b>{s.profile?.name}</b>
          <small>
            {s.profile?.experience} · {s.profile?.days} training days / week
          </small>
        </span>
      </div>
      <h2 className="settings-section-title">Feature Settings</h2>
      <div className="more-links grouped">
        <button className="group-row" onClick={onLibrary}>
          <Layers size={20} />
          <span>Exercise library</span>
          <ChevronRight size={18} />
        </button>
        <button className="group-row" onClick={onHistory}>
          <BookOpen size={20} />
          <span>Workout history</span>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="preferences-grid">
        <div className="stack">
          <details className="panel preference-group">
            <summary>Training preferences</summary>
            <div className="preference-content">
              <div className="form-grid">
                <Field label="Display name">
                  <input
                    maxLength={120}
                    value={s.profile!.name}
                    onChange={(e) => {
                      if (e.target.value)
                        change((s) => ({
                          ...s,
                          profile: { ...s.profile!, name: e.target.value },
                        }));
                    }}
                  />
                </Field>
                <Field label="Planned days / week">
                  <Num
                    label="Planned days / week"
                    min={1}
                    max={7}
                    value={s.profile!.days}
                    onChange={(days) =>
                      change((s) => ({
                        ...s,
                        profile: { ...s.profile!, days },
                      }))
                    }
                  />
                </Field>
                <Field label="Load units">
                  <select
                    value={s.settings.unit}
                    onChange={(e) =>
                      change((s) => ({
                        ...s,
                        settings: {
                          ...s.settings,
                          unit: e.target.value as "kg" | "lb",
                        },
                      }))
                    }
                  >
                    <option>kg</option>
                    <option>lb</option>
                  </select>
                </Field>
                <Field label="Appearance">
                  <select
                    value={s.settings.theme}
                    onChange={(e) =>
                      change((s) => ({
                        ...s,
                        settings: {
                          ...s.settings,
                          theme: e.target.value as "dark" | "light",
                        },
                      }))
                    }
                  >
                    <option value="dark">Graphite · Dark</option>
                    <option value="light">Mineral · Light</option>
                  </select>
                </Field>
              </div>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={s.settings.autoAdvance !== false}
                  onChange={(e) =>
                    change((data) => ({
                      ...data,
                      settings: {
                        ...data.settings,
                        autoAdvance: e.target.checked,
                      },
                    }))
                  }
                />
                Automatically move to the next exercise
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={s.settings.celebrations !== false}
                  onChange={(e) =>
                    change((d) => ({
                      ...d,
                      settings: {
                        ...d.settings,
                        celebrations: e.target.checked,
                      },
                    }))
                  }
                />
                PR and workout celebrations
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={s.settings.celebrationSound === true}
                  onChange={(e) => {
                    unlockFeedbackAudio();
                    change((d) => ({
                      ...d,
                      settings: {
                        ...d.settings,
                        celebrationSound: e.target.checked,
                      },
                    }));
                  }}
                />
                Celebration sounds
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={s.settings.timerSound}
                  onChange={(e) =>
                    change((s) => ({
                      ...s,
                      settings: { ...s.settings, timerSound: e.target.checked },
                    }))
                  }
                />
                Rest timer chime (while app is open)
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={s.settings.reminders}
                  onChange={(e) =>
                    change((s) => ({
                      ...s,
                      settings: { ...s.settings, reminders: e.target.checked },
                    }))
                  }
                />
                Show an in-app training reminder
              </label>
              <p className="caption">
                Enable background rest alerts from the rest timer controls. The
                in-app chime mixes with music where supported; iPhone Silent
                mode may mute it. Lock-screen sound is controlled by iOS.
                Standardized loads are stored in kg. Unfamiliar machine/band
                labels stay raw and are never converted.
              </p>
            </div>
          </details>
          <details className="panel preference-group">
            <summary>Equipment</summary>
            <div className="preference-content">
              {D.equipment.map((item) => (
                <label className="check-line" key={item}>
                  <input
                    type="checkbox"
                    checked={s.profile!.equipment.includes(item)}
                    onChange={(e) =>
                      change((data) => ({
                        ...data,
                        profile: {
                          ...data.profile!,
                          equipment: e.target.checked
                            ? [...data.profile!.equipment, item]
                            : data.profile!.equipment.filter((x) => x !== item),
                        },
                      }))
                    }
                  />
                  {item}
                </label>
              ))}
              <p className="caption">
                Available load lists stay with each exercise setup.
              </p>
            </div>
          </details>
          {publicWorkspace ? (
            <details className="panel preference-group">
              <summary>AI is unavailable in public mode</summary>
              <div className="preference-content">
                <p>
                  Private Gemini keys are never bound to this workspace. Manual
                  programs, starter templates, workouts and imports remain
                  available.
                </p>
              </div>
            </details>
          ) : (
            <details className="panel preference-group">
              <summary>AI provider</summary>
              <GeminiKeySettings />
            </details>
          )}
          <details className="panel preference-group">
            <summary>Built-in workout coach</summary>
            <div className="preference-content">
              <CoachSettingsPanel />
            </div>
          </details>
          <details className="panel preference-group">
            <summary>Your data, portable.</summary>
            <div className="preference-content">
              <p>
                Keep a private backup of programs, custom exercises, sessions
                and drafts. Credentials are never included.
              </p>
              <div className="actions wrap">
                <Button
                  onClick={async () =>
                    download(
                      `neoform-${D.today()}.jsonl`,
                      await exportHistoryBackup(s),
                      "application/json",
                    )
                  }
                >
                  <Download size={18} />
                  Export JSON backup
                </Button>
                <Button
                  onClick={() =>
                    download(
                      `neoform-${D.today()}.csv`,
                      D.csvSessions(s.sessions, exercises),
                      "text/csv",
                    )
                  }
                >
                  <Download size={18} />
                  Export session CSV
                </Button>
                <Button
                  onClick={async () => {
                    await Promise.all(
                      exportPendingCopies().map(async (box, i) =>
                        download(
                          `neoform-pending-${i + 1}-${D.today()}.jsonl`,
                          await exportHistoryBackup(box.data),
                          "application/x-ndjson",
                        ),
                      ),
                    );
                  }}
                >
                  Export pending tab copies
                </Button>
                <Button
                  onClick={() =>
                    open({ title: "Import from Hevy", content: <HevyImport /> })
                  }
                >
                  Import from Hevy
                </Button>
              </div>
              <label className="upload-button">
                Import JSON backup
                <input
                  type="file"
                  accept=".json,.jsonl,application/json,application/x-ndjson"
                  aria-label="Import JSON backup"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const incoming = await importHistoryBackup(file);
                      open({
                        title: "Review your backup",
                        content: (
                          <>
                            <p>
                              Validated backup:{" "}
                              <b>
                                {incoming.sessions.length} sessions,{" "}
                                {incoming.programs.length} programs,{" "}
                                {incoming.customExercises.length} custom
                                exercises
                              </b>
                              {incoming.draft ? " and an active draft" : ""}.
                            </p>
                            <p>
                              Merge retains distinct IDs. Imported versions win
                              matching IDs, profile, preferences and draft.
                              Replace removes current account data and uses the
                              backup. Export first; changes sync to this
                              account.
                            </p>
                            <div className="actions wrap">
                              <Button onClick={close}>Cancel</Button>
                              <Button
                                variant="primary"
                                onClick={async () => {
                                  if (
                                    await saveChange((s) =>
                                      D.mergeStates(s, incoming),
                                    )
                                  ) {
                                    close();
                                    setNotice("Backup merged.");
                                  }
                                }}
                              >
                                Confirm merge
                              </Button>
                              <Button
                                variant="danger"
                                onClick={async () => {
                                  if (await saveChange(() => incoming)) {
                                    close();
                                    setNotice(
                                      "Account data replaced from backup.",
                                    );
                                  }
                                }}
                              >
                                Confirm replace
                              </Button>
                            </div>
                          </>
                        ),
                      });
                    } catch (err) {
                      setNotice((err as Error).message);
                    }
                  }}
                />
              </label>
              <p className="caption">
                Checksummed backups include coaching history when present. Older
                backups remain supported. Files are unencrypted; store them
                privately. CSV contains completed set rows with canonical kg or
                raw machine labels, equipment and convention.
              </p>
            </div>
          </details>
          <details className="panel preference-group">
            <summary>
              {publicWorkspace ? "Workspace access" : "Account & access"}
            </summary>
            <div className="preference-content">
              <p>{userEmail}</p>
              {publicWorkspace ? (
                <p>
                  No account or sign-in. This shared workspace is publicly
                  readable and writable. Existing private accounts remain
                  separate and cannot be accessed in this mode.
                </p>
              ) : singleUser ? (
                <>
                  <p>Single-user / this PC</p>
                  <p className="caption">
                    Opens your existing local account without sign-in. Access
                    changes are disabled; restart with the authenticated
                    configuration to manage credentials. Do not share or tunnel
                    this server.
                  </p>
                </>
              ) : (
                <>
                  <div className="actions wrap">
                    <Button
                      onClick={() =>
                        open({
                          title: "Change your password",
                          content: <PasswordForm close={close} />,
                        })
                      }
                    >
                      Change password
                    </Button>
                    <Button
                      onClick={() =>
                        void logout().catch((e) => setNotice(e.message))
                      }
                    >
                      <LogOut size={17} />
                      Sign out
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        open({
                          title: "Permanently delete account",
                          content: <DeleteAccount close={close} />,
                        })
                      }
                    >
                      Delete account & data
                    </Button>
                  </div>
                  <p className="caption">
                    Password change signs out other devices. Sign out clears
                    this device's account cache after syncing. Email password
                    reset is unavailable; keep your passphrase safe.
                  </p>
                </>
              )}
            </div>
          </details>
        </div>
        <div className="stack">
          <details className="panel preference-group">
            <p className="eyebrow">FIELD NOTES</p>
            <summary>A few useful principles.</summary>
            <div className="preference-content">
              <details open>
                <summary>Effort, sets & comparisons</summary>
                <p>
                  RIR is reps in reserve; RPE = 10 − RIR here. Direct
                  straight/down sets at ≤4 RIR are counted separately from
                  advanced raw bouts. No fractional growth credits are inferred.
                  Warmups do not contribute to volume, records or progression.
                  Load convention matters: per dumbbell means one implement;
                  total means both sides combined. Machine labels are not
                  standardized.
                </p>
              </details>
              <details>
                <summary>How progression works</summary>
                <p>
                  Two recent comparable exposures with known prescriptions and
                  explicit current recovery are needed. Unresolved pain/systemic
                  fatigue and missing context veto escalation. Beginners keep at
                  least 2 RIR. The original load cap is the smaller of 2.5% and
                  2.5 kg, subject to available equipment. Method, bout and phase
                  contexts remain separate; advanced sequence progression stays
                  manual. Acceptance is explicit, never a promise of optimal
                  growth.
                </p>
              </details>
              <details>
                <summary>Offline & device conflicts</summary>
                <p>
                  Open the app online once to cache the public shell. Your draft
                  and account outbox stay on this device through refresh.
                  Reconnect to sync. If another device edited the same account,
                  review both versions; export them, then choose cloud, merge or
                  explicit replacement. Account data and credentials are never
                  cached by the service worker. Pending changes must sync or be
                  backed up before sign-out.
                </p>
              </details>
              <details>
                <summary>Privacy & recovery</summary>
                {publicWorkspace ? (
                  <p>
                    Anyone with this URL can read, edit, import, replace or
                    clear shared training data. Do not enter private
                    information. AI and private accounts are unavailable. Export
                    a backup before making shared changes; the device cache and
                    exported files are unencrypted.
                  </p>
                ) : (
                  <p>
                    Only your authenticated account can read its data.
                    Demonstrations use third-party YouTube content. AI sends
                    only bounded training preferences to Google Gemini using
                    your account's encrypted API key; Google charges and quotas
                    may apply. Data is stored in D1; offline cache is
                    unencrypted on your device. Exports are private files.
                    Account deletion removes backend records and this browser
                    cache; other offline devices retain their local copy until
                    sign-out. Treat persistent pain as a reason to seek
                    qualified advice, not to force a load increase.
                  </p>
                )}
              </details>
              <details>
                <summary>Install & references</summary>
                <p>
                  Use your browser's Install app or Add to Home Screen option on
                  supported HTTPS browsers. Localhost also supports the offline
                  shell.
                </p>
                <p>
                  Interaction inspiration:{" "}
                  <a
                    href="https://macrofactor.com/welcome-to-macrofactor-workouts/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    MacroFactor Workouts
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://rpstrength.com/pages/hypertrophy-app"
                    target="_blank"
                    rel="noreferrer"
                  >
                    RP Hypertrophy
                  </a>
                  . NEOFORM uses original templates, text, styling and
                  deterministic heuristics.
                </p>
              </details>
            </div>
          </details>
          <section className="quiet-card">
            <ShieldCheck size={22} />
            <div>
              <h3>
                {publicWorkspace
                  ? "Shared with every visitor."
                  : "Built around your privacy."}
              </h3>
              <p>
                Export any time. Change your plan any time. Your training is
                yours to keep.
              </p>
            </div>
          </section>
          <Button
            variant="ghost"
            onClick={() =>
              confirm(
                "Clear training data?",
                publicWorkspace
                  ? "This removes shared programs, custom exercises, sessions and active draft for EVERY visitor. Export a backup first."
                  : "This removes programs, custom exercises, sessions and active draft from your account. Your login and profile are retained. Export a backup first.",
                () =>
                  change((s) => ({
                    ...D.emptyState(),
                    profile: s.profile,
                    settings: s.settings,
                  })),
              )
            }
          >
            Clear training data
          </Button>
        </div>
      </div>
    </>
  );
}
function Reauthenticate({
  email,
  close,
}: {
  email: string;
  close: () => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await login("login", email, password);
          close();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Your session expired. Sign in to {email} to sync the draft preserved on
        this device.
      </p>
      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        Restore access & sync
      </Button>
    </form>
  );
}
function PasswordForm({ close }: { close: () => void }) {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await request("/password", "POST", { currentPassword, newPassword });
          close();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Current password">
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="New password">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
      </Field>
      <p>
        Use a unique passphrase of at least 12 characters. Other device sessions
        will be revoked.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        Change password
      </Button>
    </form>
  );
}
function DeleteAccount({ close }: { close: () => void }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await request("/account", "DELETE", { password });
          await clearLocal();
          close();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        All backend account data is permanently removed. Export a backup first.
        Offline copies on other devices must be cleared there.
      </p>
      <Field label="Your password">
        <input
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Type DELETE to confirm">
        <input
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="danger"
        disabled={busy || confirm !== "DELETE"}
      >
        Permanently delete account
      </Button>
    </form>
  );
}
