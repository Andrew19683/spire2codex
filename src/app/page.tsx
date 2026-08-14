"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateStats,
  characterById,
  characters,
  createRun,
  loseRun,
  replaceCharacters,
  winAscension,
} from "@/domain/ladder";
import { CharacterId, Run, UserData } from "@/domain/types";
import { validateUsername } from "@/domain/auth";
import {
  LocalStorageUserDataRepository,
  SupabaseUserDataRepository,
  UserDataRepository,
} from "@/storage/userDataRepository";
import { getSupabase } from "@/storage/supabase/client";
import { CoopRepository } from "@/storage/coopRepository";
import { CoopGroup } from "@/domain/coopLadder";
import CoopChallenge from "./CoopChallenge";
import Brand from "./Brand";
import MasterRotationChallenge from "./MasterRotationChallenge";
import { emptyMasterRotation } from "@/domain/masterRotation";
import { CoopMasterRepository } from "@/storage/coopMasterRepository";
import { CoopMasterGroup } from "@/domain/coopMasterRotation";
import CoopMasterRotationChallenge from "./CoopMasterRotationChallenge";
import { ContentRepository } from "@/storage/contentRepository";
import { CardMasteryRepository } from "@/storage/cardMasteryRepository";
import CardMasteryChallenge from "./CardMasteryChallenge";

type ChallengeCardData = {
  id: string;
  type: "solo" | "coop";
  available: boolean;
  title: string;
  description: string;
  icon: string;
  primaryStatus: string;
  additionalStatus?: string;
  activeEntityCount: number;
  invitationCount: number;
  primaryRoute: "ladder" | "coop" | "master-rotation" | "coop-master-rotation" | "card-mastery";
  actionLabel: string;
  displayOrder: number;
};

const EMPTY: UserData = {
  activeRun: null,
  history: [],
  preferences: { interfaceLocale: "ru", contentLocale: "en" },
  masterRotation: emptyMasterRotation(),
};
const fmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
function character(id: CharacterId) {
  return characterById(id);
}
function Login({
  onDemo,
  onAuthenticated,
}: {
  onDemo: () => void;
  onAuthenticated: (userId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [screen, setScreen] = useState<"login" | "register" | "check-email">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = getSupabase();

  if (screen === "check-email") {
    return (
      <main className="login">
        <div className="brand"><Brand /></div>
        <section className="loginCard">
          <div className="rune">✉</div>
          <p className="eyebrow">ПОДТВЕРЖДЕНИЕ EMAIL</p>
          <h1>Проверьте почту</h1>
          <p className="muted">Мы отправили ссылку подтверждения на <strong>{email}</strong>. После перехода по ней вы автоматически войдёте в аккаунт.</p>
          <button className="ghost fullWidth" onClick={() => setScreen("login")}>Вернуться ко входу</button>
        </section>
      </main>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Supabase не настроен. Можно продолжить в demo-режиме.");
      return;
    }
    setBusy(true);
    try {
      if (screen === "register") {
        const usernameError = validateUsername(username);
        if (usernameError) throw new Error(usernameError);
        const { data: available, error: availabilityError } = await supabase.rpc(
          "is_username_available",
          { candidate: username },
        );
        if (availabilityError) throw availabilityError;
        if (!available) throw new Error("Этот username уже занят.");

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session && data.user) await onAuthenticated(data.user.id);
        else setScreen("check-email");
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await onAuthenticated(data.user.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось выполнить запрос.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="brand">
        <Brand />
      </div>
      <section className="loginCard">
        <div className="rune">⌁</div>
        <p className="eyebrow">{screen === "register" ? "НОВЫЙ АККАУНТ" : "ДОБРО ПОЖАЛОВАТЬ"}</p>
        <h1>{screen === "register" ? "Создать аккаунт" : "Твоя история восхождений"}</h1>
        <p className="muted">
          Отмечай челленджи, следи за прогрессом и покоряй Шпиль.
        </p>
        <form onSubmit={submit}>
          {screen === "register" && (
            <label>
              Username
              <input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_-]+" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="spire_climber" />
              <small>3–24 символа: A–Z, 0–9, _ и -. Изменить позже нельзя.</small>
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              required
              minLength={8}
              type="password"
              placeholder="••••••••"
              value={password}
              autoComplete={screen === "register" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="formError" role="alert">{error}</p>}
          <button disabled={busy} className="primary">{busy ? "Подождите…" : screen === "register" ? "Зарегистрироваться" : "Войти"}</button>
          {screen === "login" && <button type="button" className="textButton" onClick={() => setError("Восстановление пароля пока не реализовано.")}>Забыли пароль?</button>}
        </form>
        <button className="ghost fullWidth" onClick={() => { setError(""); setScreen(screen === "login" ? "register" : "login"); }}>
          {screen === "login" ? "Создать аккаунт" : "Уже есть аккаунт? Войти"}
        </button>
        <div className="divider"><span>или</span></div>
        <button className="ghost fullWidth" onClick={onDemo}>
          Продолжить в demo-режиме
        </button>
        <p className="demoWarning">⚠ Данные demo-режима хранятся только в этом браузере и не переносятся в аккаунт.</p>
      </section>
    </main>
  );
}
export default function Home() {
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState<"account" | "demo" | null>(null),
    [userId, setUserId] = useState(""),
    [username, setUsername] = useState(""),
    [repository, setRepository] = useState<UserDataRepository | null>(null),
    [storageError, setStorageError] = useState(""),
    [contentError, setContentError] = useState(""),
    [, setContentRevision] = useState(0),
    [view, setView] = useState<"home" | "ladder" | "coop" | "master-rotation" | "coop-master-rotation" | "card-mastery">("home"),
    [data, setData] = useState<UserData>(EMPTY),
    [selected, setSelected] = useState<CharacterId | null>(null),
    [pageSize, setPageSize] = useState(5),
    [page, setPage] = useState(1),
    [deleting, setDeleting] = useState<Run | null>(null),
    [coopGroups, setCoopGroups] = useState<CoopGroup[]>([]),
    [coopMasterGroups, setCoopMasterGroups] = useState<CoopMasterGroup[]>([]),
    [cardMasterySummary, setCardMasterySummary] = useState({ completed: false, ascension: 1, additionalCards: 0 });
  useEffect(() => {
    const client = getSupabase();
    let active = true;
    if (!client) {
      setContentError("Supabase не настроен: каталог игрового контента недоступен.");
      return;
    }
    new ContentRepository(client).characters(data.preferences.contentLocale)
      .then((items) => {
        if (!active) return;
        replaceCharacters(items);
        setContentRevision((value) => value + 1);
        setContentError(items.some((item) => item.available) ? "" : "В каталоге нет активных персонажей.");
      })
      .catch((caught) => {
        if (active) setContentError(caught instanceof Error ? caught.message : "Не удалось загрузить игровой контент.");
      });
    return () => { active = false; };
  }, [data.preferences.contentLocale]);
  const activateAccount = useCallback(async (userId: string) => {
    const client = getSupabase();
    if (!client) return;
    const repo = new SupabaseUserDataRepository(client, userId);
    const [{ data: profile, error: profileError }, saved] = await Promise.all([
      client.from("profiles").select("username").eq("id", userId).single(),
      repo.load(),
    ]);
    if (profileError) throw profileError;
    setData(saved ?? EMPTY);
    setUsername(profile.username);
    setUserId(userId);
    setRepository(repo);
    setMode("account");
    setReady(true);
  }, []);

  useEffect(() => {
    const client = getSupabase();
    let active = true;
    const restore = async () => {
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session && active) {
          try { await activateAccount(session.user.id); } catch (caught) {
            if (active) setStorageError(caught instanceof Error ? caught.message : "Не удалось загрузить аккаунт.");
          }
        }
      }
      if (active) setReady(true);
    };
    void restore();
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && active) void activateAccount(session.user.id);
      if (event === "SIGNED_OUT" && active) { setMode(null); setRepository(null); setUsername(""); setUserId(""); setData(EMPTY); }
    }).data.subscription;
    return () => { active = false; subscription?.unsubscribe(); };
  }, [activateAccount]);

  useEffect(() => {
    if (!ready || !repository || !mode) return;
    const timeout = window.setTimeout(() => {
      repository.save(data).then(() => setStorageError("")).catch((caught) => setStorageError(caught instanceof Error ? caught.message : "Не удалось сохранить данные."));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [data, mode, ready, repository]);
  const stats = calculateStats(data.history);
  const coopRepository = useMemo(() => mode === "account" && userId && getSupabase() ? new CoopRepository(getSupabase()!, userId) : null, [mode, userId]);
  const coopMasterRepository = useMemo(() => mode === "account" && userId && getSupabase() ? new CoopMasterRepository(getSupabase()!, userId) : null, [mode, userId]);
  const cardMasteryRepository = useMemo(() => mode === "account" && userId && getSupabase() ? new CardMasteryRepository(getSupabase()!) : null, [mode, userId]);
  const updateCardMasterySummary = useCallback((summary: { completed: boolean; ascension: number; additionalCards: number }) => setCardMasterySummary(summary), []);
  useEffect(() => {
    let active = true;
    if (!cardMasteryRepository) { setCardMasterySummary({ completed: false, ascension: 1, additionalCards: 0 }); return; }
    cardMasteryRepository.state().then((state) => {
      if (active) setCardMasterySummary({ completed: state.completed, ascension: state.currentAscension, additionalCards: state.additionalCardsCount });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [cardMasteryRepository]);
  useEffect(() => {
    let active = true;
    if (!coopRepository) {
      setCoopGroups([]);
      return;
    }
    coopRepository.groups()
      .then((groups) => { if (active) setCoopGroups(groups); })
      .catch(() => { if (active) setCoopGroups([]); });
    return () => { active = false; };
  }, [coopRepository, view]);
  useEffect(() => {
    let active = true;
    if (!coopMasterRepository) { setCoopMasterGroups([]); return; }
    coopMasterRepository.groups().then((groups) => { if (active) setCoopMasterGroups(groups); }).catch(() => { if (active) setCoopMasterGroups([]); });
    return () => { active = false; };
  }, [coopMasterRepository, view]);
  const pages = Math.max(1, Math.ceil(data.history.length / pageSize));
  const shown = data.history.slice((page - 1) * pageSize, page * pageSize);
  if (!ready) return null;
  if (!mode) return <Login onAuthenticated={activateAccount} onDemo={() => {
    const repo = new LocalStorageUserDataRepository();
    repo.load().then((saved) => {
      setData(saved ?? EMPTY);
      setRepository(repo);
      setMode("demo");
    });
  }} />;
  const finish = (result: "win" | "lose") => {
    if (!data.activeRun) return;
    const next =
      result === "win" ? winAscension(data.activeRun) : loseRun(data.activeRun);
    setData((d) =>
      next.status === "active"
        ? { ...d, activeRun: next }
        : { ...d, activeRun: null, history: [next, ...d.history] },
    );
  };
  const completedSoloRuns = data.history.filter((run) => run.status === "completed").length;
  const pendingInvitations = coopGroups.filter((group) => group.members.find((member) => member.userId === userId)?.status === "pending");
  const activeCoopGroups = coopGroups.filter((group) => group.members.every((member) => member.status === "accepted"));
  const activeCoopRuns = activeCoopGroups.filter((group) => group.activeRun).length;
  const pendingMasterInvitations = coopMasterGroups.filter((group) => group.members.find((member) => member.userId === userId)?.status === "pending");
  const activeMasterGroups = coopMasterGroups.filter((group) => group.members.every((member) => member.status === "accepted"));
  const soloStatus = data.activeRun
    ? `Активная попытка · A${data.activeRun.currentAscension}`
    : completedSoloRuns
      ? `Пройден ${completedSoloRuns} ${completedSoloRuns === 1 ? "раз" : completedSoloRuns < 5 ? "раза" : "раз"}`
      : "Нет активной попытки";
  const coopStatus = activeCoopGroups.length === 0
    ? "Нет активных групп"
    : activeCoopGroups.length === 1
      ? `1 активная группа${activeCoopRuns ? ` · забег на A${activeCoopGroups.find((group) => group.activeRun)?.activeRun?.currentAscension}` : ""}`
      : `${activeCoopGroups.length} активные группы${activeCoopRuns ? ` · ${activeCoopRuns} ${activeCoopRuns === 1 ? "забег" : "забега"} в процессе` : ""}`;
  const challenges: ChallengeCardData[] = [
    {
      id: "card-mastery",
      type: "solo",
      available: mode === "account",
      title: "Card Mastery",
      description: "Освой каждую доступную карту на A1–A10. Новая цель выбирается перед каждой попыткой.",
      icon: "✦",
      primaryStatus: mode === "demo" ? "Доступно после входа" : cardMasterySummary.completed ? "Пройден" : `Текущее Вознесение · A${cardMasterySummary.ascension}`,
      additionalStatus: cardMasterySummary.additionalCards ? `Новых карт: ${cardMasterySummary.additionalCards}` : undefined,
      activeEntityCount: cardMasterySummary.completed ? 0 : 1,
      invitationCount: 0,
      primaryRoute: "card-mastery",
      actionLabel: cardMasterySummary.completed ? "Статистика" : "Открыть",
      displayOrder: 3,
    },
    {
      id: "ladder",
      type: "solo",
      available: true,
      title: "Ladder",
      description: "Пройди десять уровней Вознесения подряд без поражений. Один персонаж, одна попытка.",
      icon: "♜",
      primaryStatus: soloStatus,
      additionalStatus: data.activeRun ? "Активная попытка" : undefined,
      activeEntityCount: data.activeRun ? 1 : 0,
      invitationCount: 0,
      primaryRoute: "ladder",
      actionLabel: data.activeRun ? "Продолжить" : completedSoloRuns ? "Начать снова" : "Начать",
      displayOrder: 1,
    },
    {
      id: "coop-master-rotation",
      type: "coop",
      available: mode === "account",
      title: "Co-op Master Rotation",
      description: "Освойте каждое Вознесение всеми персонажами каждого участника. Общая ротация, Fairy и групповая статистика.",
      icon: "↻",
      primaryStatus: mode === "demo" ? "Доступно после входа" : activeMasterGroups.length ? `${activeMasterGroups.length} ${activeMasterGroups.length === 1 ? "активная группа" : "активные группы"}` : "Нет активных групп",
      additionalStatus: pendingMasterInvitations.length ? `${pendingMasterInvitations.length} ${pendingMasterInvitations.length === 1 ? "приглашение" : "приглашения"}` : undefined,
      activeEntityCount: activeMasterGroups.length,
      invitationCount: pendingMasterInvitations.length,
      primaryRoute: "coop-master-rotation",
      actionLabel: activeMasterGroups.length ? "Открыть группы" : "Создать группу",
      displayOrder: 2,
    },
    {
      id: "master-rotation",
      type: "solo",
      available: true,
      title: "Master Rotation",
      description: "Пройдите выбранное Вознесение каждым персонажем. Поражение сбрасывает ротацию, Fairy сохраняет уровень.",
      icon: "↻",
      primaryStatus: data.masterRotation.initialized
        ? `${data.masterRotation.mode === "master" ? "Master Mode" : `A${data.masterRotation.currentAscension}`} · 🧚 ${data.masterRotation.fairies}`
        : "Режим не выбран",
      additionalStatus: data.masterRotation.activeAttempt ? "Активная ротация" : undefined,
      activeEntityCount: data.masterRotation.activeAttempt ? 1 : 0,
      invitationCount: 0,
      primaryRoute: "master-rotation",
      actionLabel: data.masterRotation.activeAttempt ? "Продолжить" : data.masterRotation.initialized ? "Открыть" : "Выбрать режим",
      displayOrder: 2,
    },
    {
      id: "coop-ladder",
      type: "coop",
      available: mode === "account",
      title: "Co-op Ladder",
      description: "Соберите постоянную группу из 2–4 игроков и пройдите A1–A10 вместе. Общая попытка и статистика связок.",
      icon: "⚔",
      primaryStatus: mode === "demo" ? "Доступно после входа" : coopStatus,
      additionalStatus: pendingInvitations.length ? `${pendingInvitations.length} ${pendingInvitations.length === 1 ? "приглашение" : "приглашения"}` : undefined,
      activeEntityCount: activeCoopGroups.length,
      invitationCount: pendingInvitations.length,
      primaryRoute: "coop",
      actionLabel: activeCoopGroups.length === 0 ? "Создать группу" : activeCoopGroups.length === 1 ? "Открыть группу" : "Открыть группы",
      displayOrder: 1,
    },
  ];
  const challengeSections = [
    { type: "solo" as const, icon: "♙", title: "Соло", description: "Личные испытания и статистика отдельных забегов" },
    { type: "coop" as const, icon: "♟", title: "Кооператив", description: "Испытания для постоянных групп игроков" },
  ];
  return (
    <div className="app">
      <header>
        <button className="brand buttonish" onClick={() => setView("home")}>
          <Brand />
        </button>
        <nav>
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => setView("home")}
          >
            Главная
          </button>
          <button
            className={view === "ladder" ? "active" : ""}
            onClick={() => setView("ladder")}
          >
            Челленджи
          </button>
        </nav>
        <div className="headerActions">
          <span className="identity">{mode === "demo" ? "Demo" : `@${username}`}</span>
          <label>
            Интерфейс{" "}
            <select
              value={data.preferences.interfaceLocale}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  preferences: {
                    ...d.preferences,
                    interfaceLocale: e.target.value as "ru" | "en",
                  },
                }))
              }
            >
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </label>
          <label>
            Контент{" "}
            <select
              value={data.preferences.contentLocale}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  preferences: {
                    ...d.preferences,
                    contentLocale: e.target.value as "en" | "ru",
                  },
                }))
              }
            >
              <option value="en">EN</option>
              <option value="ru">RU</option>
            </select>
          </label>
          <button
            className="logout"
            onClick={async () => {
              if (mode === "account") await getSupabase()?.auth.signOut();
              else { setMode(null); setRepository(null); setData(EMPTY); }
            }}
            aria-label="Выйти из аккаунта"
            title="Выйти из аккаунта"
          >
            Выйти{" "}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            </svg>
          </button>
        </div>
      </header>
      {mode === "demo" && <div className="demoBanner">Demo-режим: данные хранятся только в этом браузере и не будут перенесены в аккаунт.</div>}
      {storageError && <div className="errorBanner">Ошибка синхронизации: {storageError}</div>}
      {contentError && <div className="errorBanner">Ошибка каталога: {contentError}</div>}
      {view === "home" ? (
        <main>
          <section className="hero">
            <p className="eyebrow">SLAY THE SPIRE 2 · CHALLENGES</p>
            <h1>
              Путь наверх начинается
              <br />с одного шага.
            </h1>
            <p>
              Выбери испытание, начни забег и оставь свой след в истории Шпиля.
            </p>
          </section>
          <div className="challengeSections">
            {challengeSections.map((section) => {
              const cards = challenges.filter((challenge) => challenge.type === section.type).sort((a, b) => a.displayOrder - b.displayOrder);
              return (
                <section className={`challengeSection ${section.type}`} key={section.type}>
                  <div className="challengeSectionHead">
                    <span className="sectionModeIcon" aria-hidden="true">{section.icon}</span>
                    <div>
                      <h2>{section.title}</h2>
                      <p>{section.description}</p>
                    </div>
                    <span className="challengeCount">{cards.length} {cards.length === 1 ? "челлендж" : "челленджа"}</span>
                  </div>
                  <div className="challengeGrid">
                    {cards.map((challenge) => (
                      <button className="challengeCard" key={challenge.id} onClick={() => setView(challenge.primaryRoute)}>
                        <span className="challengeIcon" aria-hidden="true">{challenge.icon}</span>
                        {challenge.additionalStatus && (
                          <span className={`urgentBadge ${challenge.invitationCount ? "invitation" : "active"}`}>{challenge.additionalStatus}</span>
                        )}
                        <h3>{challenge.title}</h3>
                        <p className="challengeDescription">{challenge.description}</p>
                        <div className={`challengeStatus ${challenge.activeEntityCount ? "highlighted" : ""}`}>{challenge.primaryStatus}</div>
                        <span className="challengeAction">{challenge.actionLabel}<span aria-hidden="true">→</span></span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      ) : view === "coop" ? (
        <CoopChallenge repository={coopRepository} userId={userId} onBack={() => setView("home")} />
      ) : view === "master-rotation" ? (
        <MasterRotationChallenge data={data.masterRotation} onChange={(masterRotation) => setData((current) => ({...current, masterRotation}))} onBack={() => setView("home")} />
      ) : view === "coop-master-rotation" ? (
        <CoopMasterRotationChallenge repository={coopMasterRepository} userId={userId} onBack={() => setView("home")} />
      ) : view === "card-mastery" ? (
        <CardMasteryChallenge repository={cardMasteryRepository} contentLocale={data.preferences.contentLocale} onBack={() => setView("home")} onStateChange={updateCardMasterySummary} />
      ) : (
        <main className="ladder">
          <button className="back" onClick={() => setView("home")}>
            ← Все челленджи
          </button>
          <div className="ladderHead">
            <div>
              <p className="eyebrow">ИСПЫТАНИЕ</p>
              <h1>Ladder Challenge</h1>
              <p>
                Пройди десять уровней Вознесения подряд. Одно поражение
                завершает попытку, и следующую придётся начать с A1.
              </p>
            </div>
          </div>
          {data.activeRun ? (
            <section className="activeRun">
              <div className="runTop">
                <div
                  className="portrait"
                  style={
                    {
                      "--c": character(data.activeRun.characterId).color,
                    } as React.CSSProperties
                  }
                >
                  {character(data.activeRun.characterId).sigil}
                </div>
                <div>
                  <p className="eyebrow">АКТИВНЫЙ ЗАБЕГ</p>
                  <h2>{character(data.activeRun.characterId).name}</h2>
                  <p className="muted">
                    Следующее испытание — Вознесение{" "}
                    {data.activeRun.currentAscension}
                  </p>
                </div>
                <strong>{data.activeRun.completedAscensions}/10</strong>
              </div>
              <div className="steps">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className={
                      i < data.activeRun!.completedAscensions
                        ? "done"
                        : i === data.activeRun!.completedAscensions
                          ? "current"
                          : ""
                    }
                  >
                    <span>
                      {i < data.activeRun!.completedAscensions ? "✓" : i + 1}
                    </span>
                    <small>A{i + 1}</small>
                  </div>
                ))}
              </div>
              <div className="runActions">
                <button className="danger" onClick={() => finish("lose")}>
                  Поражение
                </button>
                <button className="primary" onClick={() => finish("win")}>
                  {data.activeRun.currentAscension === 10
                    ? "Завершить челлендж"
                    : "Победа · перейти дальше"}
                </button>
              </div>
            </section>
          ) : (
            <section className="panel">
              <div className="panelHead">
                <div>
                  <p className="eyebrow">НОВЫЙ ЗАБЕГ</p>
                  <h2>Выбери персонажа</h2>
                </div>
                <button
                  className="random"
                  onClick={() =>
                    setSelected(
                      characters[Math.floor(Math.random() * characters.length)]
                        .id,
                    )
                  }
                >
                  ⚄ Случайный выбор
                </button>
              </div>
              <div className="characters">
                {characters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={selected === c.id ? "selected" : ""}
                    style={{ "--c": c.color } as React.CSSProperties}
                  >
                    <span>{c.sigil}</span>
                    <b>{c.name}</b>
                    <small>{selected === c.id ? "ВЫБРАН" : "ВЫБРАТЬ"}</small>
                  </button>
                ))}
              </div>
              <button
                disabled={!selected}
                className="primary start"
                onClick={() => {
                  if (selected) {
                    setData((d) => ({ ...d, activeRun: createRun(selected) }));
                    setSelected(null);
                  }
                }}
              >
                Начать восхождение →
              </button>
            </section>
          )}
          <section className="grid">
            <div className="panel stats">
              <div className="panelHead">
                <div>
                  <p className="eyebrow">РЕЗУЛЬТАТЫ</p>
                  <h2>Статистика</h2>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Персонаж</th>
                    <th>Забеги</th>
                    <th>Средняя высота</th>
                    <th>Прохождения</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.characterId}>
                      <td>
                        <i
                          style={{ background: character(s.characterId).color }}
                        />
                        {character(s.characterId).name}
                      </td>
                      <td>{s.runs}</td>
                      <td>{s.average.toFixed(1)}</td>
                      <td>{s.wins}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Всего</td>
                    <td>{data.history.length}</td>
                    <td>
                      {data.history.length
                        ? (
                            data.history.reduce(
                              (a, r) => a + r.completedAscensions,
                              0,
                            ) / data.history.length
                          ).toFixed(1)
                        : "0.0"}
                    </td>
                    <td>
                      {
                        data.history.filter((r) => r.status === "completed")
                          .length
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="panel history">
              <div className="panelHead">
                <div>
                  <p className="eyebrow">АРХИВ</p>
                  <h2>История забегов</h2>
                </div>
                <label>
                  Показывать{" "}
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(+e.target.value);
                      setPage(1);
                    }}
                  >
                    <option>5</option>
                    <option>10</option>
                    <option>20</option>
                  </select>
                </label>
              </div>
              {shown.length ? (
                shown.map((r) => (
                  <div
                    className={
                      r.status === "completed"
                        ? "historyRow success"
                        : "historyRow"
                    }
                    key={r.id}
                  >
                    <div>
                      <b>{character(r.characterId).name}</b>
                      <small>
                        {fmt.format(new Date(r.startedAt))} —{" "}
                        {fmt.format(new Date(r.finishedAt!))}
                      </small>
                    </div>
                    <span>
                      {r.status === "completed"
                        ? "✦ Челлендж пройден"
                        : `Проиграл на A${r.currentAscension}`}
                    </span>
                    <button onClick={() => setDeleting(r)} aria-label="Удалить">
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty">
                  Завершённых забегов пока нет.
                  <br />
                  <small>Здесь появится история твоих восхождений.</small>
                </div>
              )}
              <div className="pager">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ←
                </button>
                <span>
                  {page} / {pages}
                </span>
                <button
                  disabled={page === pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </button>
              </div>
            </div>
          </section>
        </main>
      )}
      <footer>
        <span>SPIRE2CODEX · MVP</span>
        <span>Неофициальный фан-проект</span>
      </footer>
      {deleting && (
        <div className="modalShade" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <span className="modalIcon">!</span>
            <h2>Удалить запись?</h2>
            <p>
              Забег за {character(deleting.characterId).name} будет удалён из
              истории. Это действие нельзя отменить.
            </p>
            <div>
              <button className="ghost" onClick={() => setDeleting(null)}>
                Отмена
              </button>
              <button
                className="danger"
                onClick={() => {
                  setData((d) => ({
                    ...d,
                    history: d.history.filter((r) => r.id !== deleting.id),
                  }));
                  setDeleting(null);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
