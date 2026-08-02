"use client";
import { useEffect, useMemo, useState } from "react";
import {
  calculateStats,
  characters,
  createRun,
  loseRun,
  winAscension,
} from "@/domain/ladder";
import { CharacterId, Run, UserData } from "@/domain/types";
import { userDataRepository } from "@/storage/userDataRepository";
import { supabase } from "@/storage/supabase/client";

const EMPTY: UserData = {
  activeRun: null,
  history: [],
  preferences: { interfaceLocale: "ru", contentLocale: "en" },
};
const fmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
function character(id: CharacterId) {
  return characters.find((c) => c.id === id)!;
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login">
      <div className="brand">
        <span className="brandmark">S</span>
        <span>SPIRE2CODEX</span>
      </div>
      <section className="loginCard">
        <div className="rune">⌁</div>
        <p className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</p>
        <h1>Твоя история восхождений</h1>
        <p className="muted">
          Отмечай челленджи, следи за прогрессом и покоряй Шпиль.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();

            const { error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (error) {
              alert(error.message);
              return;
            }

            onLogin();
          }}
        >
          <label>
            Email
            <input
              required
              type="email"
              placeholder="you@example.com"
              value={email}
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
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary">Войти</button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const { error } = await supabase.auth.signUp({
                email,
                password,
              });

              if (error) {
                alert(error.message);
                return;
              }

              alert("Проверь почту и подтверди регистрацию.");
            }}
          >
            Зарегистрироваться
          </button>
        </form>
        <button className="ghost" onClick={onLogin}>
          Продолжить в demo-режиме
        </button>
        <small>Данные demo-режима хранятся только в этом браузере.</small>
      </section>
    </main>
  );
}
export default function Home() {
  const [ready, setReady] = useState(false),
    [logged, setLogged] = useState(false),
    [view, setView] = useState<"home" | "ladder">("home"),
    [data, setData] = useState<UserData>(EMPTY),
    [selected, setSelected] = useState<CharacterId | null>(null),
    [pageSize, setPageSize] = useState(5),
    [page, setPage] = useState(1),
    [deleting, setDeleting] = useState<Run | null>(null);
  useEffect(() => {
    const saved = userDataRepository.load();
    if (saved) {
      setData(saved.data || EMPTY);
      setLogged(!!saved.logged);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) userDataRepository.save({ logged, data });
  }, [data, logged, ready]);
  const stats = useMemo(() => calculateStats(data.history), [data.history]);
  const pages = Math.max(1, Math.ceil(data.history.length / pageSize));
  const shown = data.history.slice((page - 1) * pageSize, page * pageSize);
  if (!ready) return null;
  if (!logged) return <Login onLogin={() => setLogged(true)} />;
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
  return (
    <div className="app">
      <header>
        <button className="brand buttonish" onClick={() => setView("home")}>
          <span className="brandmark">S</span>
          <span>SPIRE2CODEX</span>
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
            onClick={() => setLogged(false)}
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
          <section>
            <div className="sectionTitle">
              <div>
                <p className="eyebrow">ИСПЫТАНИЯ</p>
                <h2>Доступные челленджи</h2>
              </div>
              <span>01 челлендж</span>
            </div>
            <button className="challenge" onClick={() => setView("ladder")}>
              <div>
                <span
                  className={`pill ${data.activeRun ? "inProgress" : "notStarted"}`}
                >
                  {data.activeRun ? "В ПРОЦЕССЕ" : "НЕ НАЧАТ"}
                </span>
                <h3>Ladder Challenge</h3>
                <p>
                  Пройди вознесения от A1 до A10 без единого поражения. Один
                  персонаж. Одна попытка.
                </p>
                <span className="link">
                  {data.activeRun
                    ? `Продолжить с A${data.activeRun.currentAscension} →`
                    : "Начать восхождение →"}
                </span>
              </div>
            </button>
          </section>
        </main>
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
