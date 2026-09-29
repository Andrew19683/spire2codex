"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateCardMasteryStats,
  CardMasteryCard,
  CardMasteryResult,
  createCardOffer,
} from "@/domain/cardMastery";
import { characterById, characters } from "@/domain/ladder";
import { CardMasteryRepository, CardMasterySnapshot } from "@/storage/cardMasteryRepository";

const resultLabels: Record<CardMasteryResult, string> = {
  mastered: "Освоено",
  won_not_found: "Победа · карта не встретилась",
  lost: "Поражение",
};

function poolName(card: CardMasteryCard) {
  if (card.characterId) return characterById(card.characterId).name;
  if (card.poolId === "colorless") return "Colorless";
  return card.poolId;
}

export default function CardMasteryChallenge({
  repository,
  contentLocale,
  onBack,
  onStateChange,
}: {
  repository: CardMasteryRepository | null;
  contentLocale: "en" | "ru";
  onBack: () => void;
  onStateChange: (summary: { completed: boolean; ascension: number; additionalCards: number }) => void;
}) {
  const [snapshot, setSnapshot] = useState<CardMasterySnapshot | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardMasteryCard | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!repository) { setLoading(false); return; }
    setLoading(true);
    try {
      let next = await repository.load(contentLocale);
      if (next.state.activeCardId && !next.cards.some((card) => card.id === next.state.activeCardId && card.active && card.eligible && !card.coopOnly)) {
        await repository.cancelInvalidAttempt();
        next = await repository.load(contentLocale);
      }
      setSnapshot(next);
      onStateChange({
        completed: next.state.completed,
        ascension: next.state.currentAscension,
        additionalCards: next.state.additionalCardsCount,
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить Card Mastery.");
    } finally {
      setLoading(false);
    }
  }, [contentLocale, onStateChange, repository]);

  useEffect(() => { void load(); }, [load]);

  const offer = useMemo(() => snapshot
    ? createCardOffer(snapshot.cards, snapshot.progress, snapshot.state.currentAscension)
    : [], [snapshot]);
  const stats = useMemo(() => snapshot
    ? calculateCardMasteryStats(snapshot.cards, snapshot.progress, snapshot.state.currentAscension)
    : null, [snapshot]);
  const cardById = useMemo(() => new Map(snapshot?.cards.map((card) => [card.id, card]) ?? []), [snapshot]);
  const activeCard = snapshot?.state.activeCardId ? cardById.get(snapshot.state.activeCardId) : null;
  const progressByCard = useMemo(() => new Map(snapshot?.progress.map((item) => [item.cardId, item.maxMasteredAscension]) ?? []), [snapshot]);
  const attemptStats = useMemo(() => {
    const rows = (snapshot?.attemptStats ?? []).map((item) => ({ ...item, rate: item.attempts ? item.mastered / item.attempts * 100 : 0 }));
    const totalAttempts = rows.reduce((sum, item) => sum + item.attempts, 0);
    const totalMastered = rows.reduce((sum, item) => sum + item.mastered, 0);
    return {
      hardest: [...rows].sort((a, b) => b.lost - a.lost || b.attempts - a.attempts)[0],
      unluckiest: [...rows].sort((a, b) => b.notFound - a.notFound || b.attempts - a.attempts)[0],
      totalAttempts,
      overallRate: totalAttempts ? totalMastered / totalAttempts * 100 : 0,
    };
  }, [snapshot]);

  const start = async () => {
    if (!repository || !selectedCard) return;
    const characterId = selectedCard.characterId ?? selectedCharacter;
    if (!characterId) return;
    setBusy(true);
    try {
      await repository.start(selectedCard.id, characterId);
      setSelectedCard(null);
      setSelectedCharacter(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось начать попытку.");
    } finally { setBusy(false); }
  };

  const finish = async (result: CardMasteryResult) => {
    if (!repository) return;
    const messages: Record<CardMasteryResult, string> = {
      mastered: "Подтвердить победу и освоение выбранной карты?",
      won_not_found: "Подтвердить победу, в которой карта не встретилась?",
      lost: "Подтвердить поражение? Текущее Вознесение уменьшится.",
    };
    if (!window.confirm(messages[result])) return;
    setBusy(true);
    try { await repository.finish(result); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось сохранить результат."); }
    finally { setBusy(false); }
  };

  if (!repository) return (
    <main className="ladder cardMastery">
      <button className="back" onClick={onBack}>← Все челленджи</button>
      <section className="panel coopUnavailable">
        <span className="modeRune">✦</span><h1>Card Mastery</h1>
        <p className="muted">Прогресс этого челленджа хранится в аккаунте. Войдите или зарегистрируйтесь, чтобы начать.</p>
      </section>
    </main>
  );
  if (loading && !snapshot) return <main className="ladder"><button className="back" onClick={onBack}>← Все челленджи</button><p>Загрузка Card Mastery…</p></main>;
  if (!snapshot || !stats) return <main className="ladder"><button className="back" onClick={onBack}>← Все челленджи</button><div className="errorBanner">{error || "Card Mastery недоступен."}</div></main>;

  return (
    <main className="ladder cardMastery">
      <button className="back" onClick={onBack}>← Все челленджи</button>
      <div className="ladderHead masteryHeading">
        <div><p className="eyebrow">СОЛО-ИСПЫТАНИЕ</p><h1>Card Mastery</h1><p>Освой каждую доступную карту на Вознесениях A1–A10.</p></div>
        <div className="masteryAscension"><small>ТЕКУЩИЙ УРОВЕНЬ</small><strong>A{snapshot.state.currentAscension}</strong></div>
      </div>
      {error && <div className="errorBanner inlineError">{error}<button onClick={() => void load()}>Повторить</button></div>}
      {snapshot.state.additionalCardsCount > 0 && <div className="newCardsBanner">После обновления игры появились новые карты. Осталось освоить: <strong>{snapshot.state.additionalCardsCount}</strong>.</div>}

      {snapshot.state.completed ? (
        <section className="panel masteryCompleted"><span>✦</span><div><p className="eyebrow">ИСПЫТАНИЕ ПРОЙДЕНО</p><h2>Все актуальные карты освоены на A10</h2><p>При следующем обновлении каталога запустите ручную проверку состава Card Mastery.</p></div></section>
      ) : activeCard ? (
        <section className="activeRun masteryTarget">
          <div className="targetHeader"><div><p className="eyebrow">ТЕКУЩАЯ ЦЕЛЬ · A{snapshot.state.currentAscension}</p><h2>{activeCard.name}</h2><p>{activeCard.description || "Описание отсутствует."}</p></div><strong>A{progressByCard.get(activeCard.id) ?? 0}</strong></div>
          <div className="cardFacts"><span><small>ТИП</small>{activeCard.type}</span><span><small>РЕДКОСТЬ</small>{activeCard.rarity}</span><span><small>ПУЛ</small>{poolName(activeCard)}</span><span><small>ПЕРСОНАЖ</small>{characterById(snapshot.state.selectedCharacterId!).name}</span></div>
          <blockquote>Каждый раз, когда эта карта предлагается в награде или доступна в магазине и вы можете её купить, вы обязаны взять её.</blockquote>
          <p className="shopRule"><strong>Магазин:</strong> если при первом открытии карта есть в продаже и золота хватает, купите её до других покупок.</p>
          <div className="masteryResultActions">
            <button disabled={busy} className="primary" onClick={() => void finish("mastered")}>Победа — карта была получена</button>
            <button disabled={busy} className="ghost" onClick={() => void finish("won_not_found")}>Победа — карта не встретилась</button>
            <button disabled={busy} className="danger" onClick={() => void finish("lost")}>Поражение</button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panelHead"><div><p className="eyebrow">НОВАЯ ПОПЫТКА · A{snapshot.state.currentAscension}</p><h2>Выбери карту</h2><p className="muted">{offer.length === 1 ? `На A${snapshot.state.currentAscension} осталась последняя неосвоенная карта.` : offer.length === 2 ? `На A${snapshot.state.currentAscension} осталось всего две неосвоенные карты.` : "Случайная подборка из доступных карт."}</p></div></div>
          <div className="masteryCards">
            {offer.map((card) => <button key={card.id} className={selectedCard?.id === card.id ? "selected" : ""} onClick={() => { setSelectedCard(card); setSelectedCharacter(card.characterId); }}>
              <span className="cardPool">{poolName(card)}</span><h3>{card.name}</h3><p>{card.description || "Описание отсутствует."}</p><div><span>{card.type}</span><span>{card.rarity}</span><span>Освоено до A{progressByCard.get(card.id) ?? 0}</span></div>
            </button>)}
          </div>
          {selectedCard && <div className="masteryStart">
            <div><p className="eyebrow">ПЕРСОНАЖ ПОПЫТКИ</p><h3>{selectedCard.characterId ? characterById(selectedCard.characterId).name : "Выбери персонажа для Colorless-карты"}</h3></div>
            {!selectedCard.characterId && <div className="characterPicker masteryCharacterPicker">{characters.filter((item) => item.available).map((item) => <button key={item.id} style={{ "--character-color": item.color } as React.CSSProperties} className={`characterOption ${selectedCharacter === item.id ? "selected" : ""}`} onClick={() => setSelectedCharacter(item.id)}><span className="characterIcon">{item.initials}</span><span className="characterName">{item.name}</span></button>)}</div>}
            <button className="primary" disabled={busy || !selectedCharacter} onClick={() => void start()}>Начать попытку →</button>
          </div>}
        </section>
      )}

      <section className="statCards masteryTotals"><div><small>ОСВОЕНО НА A10</small><b>{stats.masteredA10} / {stats.totalCards}</b></div><div><small>ПОЛНЫЙ ПРОГРЕСС</small><b>{stats.percentA10.toFixed(1)}%</b></div><div><small>ПРОГРЕСС A{snapshot.state.currentAscension}</small><b>{stats.masteredAtCurrent} / {stats.totalCards}</b></div><div><small>ПОПЫТОК</small><b>{attemptStats.totalAttempts}</b></div></section>
      <section className="featuredGrid masteryHighlights">
        <article className="panel"><p className="eyebrow">САМАЯ СЛОЖНАЯ</p><h3>{attemptStats.hardest ? cardById.get(attemptStats.hardest.cardId)?.name ?? attemptStats.hardest.cardId : "—"}</h3><p>{attemptStats.hardest ? `${attemptStats.hardest.lost} поражений` : "Пока недостаточно данных"}</p></article>
        <article className="panel"><p className="eyebrow">САМАЯ НЕВЕЗУЧАЯ</p><h3>{attemptStats.unluckiest ? cardById.get(attemptStats.unluckiest.cardId)?.name ?? attemptStats.unluckiest.cardId : "—"}</h3><p>{attemptStats.unluckiest ? `${attemptStats.unluckiest.notFound} побед без встречи` : "Пока недостаточно данных"}</p></article>
        <article className="panel"><p className="eyebrow">MASTERY RATE</p><h3>{attemptStats.overallRate.toFixed(1)}%</h3><p>Успешных освоений среди всех попыток</p></article>
      </section>
      <section className="panel matrixPanel"><div className="panelHead"><div><p className="eyebrow">КАРТА ОСВОЕНИЯ</p><h2>Прогресс по пулам и Вознесениям</h2></div></div><div className="masteryHeatmap"><b>Пул</b>{Array.from({length: 10}, (_, index) => <b key={index}>A{index + 1}</b>)}{stats.poolStats.map((pool) => <div className="heatmapRow" key={pool.poolId}><strong>{pool.poolId === "colorless" ? "Colorless" : characterById(pool.poolId).name}</strong>{pool.ascensions.map((percent, index) => <span key={index} style={{ "--intensity": `${Math.max(5, percent)}%` } as React.CSSProperties} title={`${percent.toFixed(1)}%`}><small>{Math.round(percent)}%</small></span>)}</div>)}</div></section>
      <section className="grid masteryBottom">
        <div className="panel"><div className="panelHead"><div><p className="eyebrow">ПУЛЫ</p><h2>Прогресс A10</h2></div></div><table><tbody>{stats.poolStats.map((pool) => <tr key={pool.poolId}><td>{pool.poolId === "colorless" ? "Colorless" : characterById(pool.poolId).name}</td><td>{pool.masteredA10} / {pool.total}</td><td>{pool.percentA10.toFixed(1)}%</td></tr>)}</tbody></table></div>
        <div className="panel masteryHistory"><div className="panelHead"><div><p className="eyebrow">ИСТОРИЯ</p><h2>Последние попытки</h2></div></div>{snapshot.attempts.length ? snapshot.attempts.slice(0, 20).map((attempt) => <div className={`historyRow ${attempt.mastered ? "success" : ""}`} key={attempt.id}><div><b>{cardById.get(attempt.cardId)?.name ?? attempt.cardId}</b><small>A{attempt.ascension} · {characterById(attempt.characterId).name} · {new Date(attempt.finishedAt).toLocaleDateString("ru-RU")}</small></div><span>{resultLabels[attempt.result]}</span></div>) : <div className="empty">Завершённых попыток пока нет.</div>}</div>
      </section>
    </main>
  );
}
