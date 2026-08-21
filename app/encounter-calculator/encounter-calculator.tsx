import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  calculateEncounter,
  createDefaultEncounter,
  createOpponentGroup,
  CR_OPTIONS,
  CR_XP,
  loadEncounterState,
  saveEncounterState,
  xpForOpponent,
} from "./encounter-rules.js";
import "./encounter-calculator.css";

type OpponentGroup = {
  id: string;
  cr: string;
  quantity: number;
  cr0Xp: 0 | 10;
};

type EncounterState = {
  partyLevel: number;
  heroCount: number;
  opponents: OpponentGroup[];
};

function newGroupId() {
  return globalThis.crypto?.randomUUID?.() ?? `opponent-${Date.now()}`;
}

function formatXp(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function Stepper({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="encounter-stepper" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= minimum}
        onClick={() => onChange(Math.max(minimum, value - 1))}
      >−</button>
      <output aria-live="polite" aria-label={`${label}: ${value}`}>{value}</output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= maximum}
        onClick={() => onChange(Math.min(maximum, value + 1))}
      >+</button>
    </div>
  );
}

export function EncounterCalculatorLauncher() {
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [darkPortal, setDarkPortal] = useState(false);
  const [state, setState] = useState<EncounterState>(() =>
    loadEncounterState(globalThis.localStorage, newGroupId()) as EncounterState,
  );
  const result = useMemo(() => calculateEncounter(state), [state]);

  useEffect(() => {
    saveEncounterState(globalThis.localStorage, state);
  }, [state]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  const openCalculator = () => {
    setDarkPortal(Boolean(launcherRef.current?.closest(".site-dark")));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  const updateOpponent = (id: string, patch: Partial<OpponentGroup>) => {
    setState((current) => ({
      ...current,
      opponents: current.opponents.map((opponent) =>
        opponent.id === id ? { ...opponent, ...patch } : opponent,
      ),
    }));
  };

  const budgetRows = [
    ["Low", result.budgets.low],
    ["Moderate", result.budgets.moderate],
    ["High", result.budgets.high],
  ] as const;

  return (
    <>
      <button
        ref={launcherRef}
        className="button"
        type="button"
        onClick={openCalculator}
      >Encounter Calculator</button>

      {open ? createPortal(
        <div
          className={`encounter-backdrop ${darkPortal ? "site-dark" : ""}`}
          role="presentation"
          onMouseDown={close}
        >
          <section
            ref={dialogRef}
            className="encounter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="encounter-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="encounter-head">
              <div>
                <span className="encounter-eyebrow">2024 rules</span>
                <h2 id="encounter-dialog-title">Encounter Calculator</h2>
                <p>Estimate difficulty using only party size, Challenge Rating, and quantity.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close encounter calculator" onClick={close}>×</button>
            </header>

            <div className="encounter-layout">
              <div className="encounter-builder">
                <section className="encounter-section" aria-labelledby="encounter-party-heading">
                  <div className="encounter-section-head">
                    <div>
                      <span className="encounter-step">1</span>
                      <h3 id="encounter-party-heading">Set the party</h3>
                    </div>
                  </div>
                  <div className="encounter-party-controls">
                    <label>
                      <span>Party level</span>
                      <select
                        value={state.partyLevel}
                        onChange={(event) => setState((current) => ({
                          ...current,
                          partyLevel: Number(event.target.value),
                        }))}
                      >
                        {Array.from({ length: 20 }, (_, index) => index + 1).map((level) => (
                          <option value={level} key={level}>Level {level}</option>
                        ))}
                      </select>
                    </label>
                    <div className="encounter-control-group">
                      <span>Heroes</span>
                      <Stepper
                        label="heroes"
                        value={state.heroCount}
                        minimum={1}
                        maximum={20}
                        onChange={(heroCount) => setState((current) => ({ ...current, heroCount }))}
                      />
                    </div>
                  </div>
                </section>

                <section className="encounter-section" aria-labelledby="encounter-opponents-heading">
                  <div className="encounter-section-head">
                    <div>
                      <span className="encounter-step">2</span>
                      <h3 id="encounter-opponents-heading">Add opponents</h3>
                    </div>
                    <button
                      className="button small"
                      type="button"
                      onClick={() => setState((current) => ({
                        ...current,
                        opponents: [...current.opponents, createOpponentGroup(newGroupId()) as OpponentGroup],
                      }))}
                    >+ Add creatures</button>
                  </div>

                  <div className="encounter-opponent-list">
                    {state.opponents.length ? state.opponents.map((opponent, index) => {
                      const eachXp = opponent.cr === "0" ? opponent.cr0Xp : CR_XP[opponent.cr];
                      return (
                        <article
                          className="encounter-opponent"
                          aria-label={`Creature row ${index + 1}`}
                          key={opponent.id}
                        >
                          <div className="encounter-opponent-controls">
                            <label>
                              <span>Challenge Rating</span>
                              <select
                                value={opponent.cr}
                                onChange={(event) => updateOpponent(opponent.id, { cr: event.target.value })}
                              >
                                {CR_OPTIONS.map((cr) => <option value={cr} key={cr}>CR {cr}</option>)}
                              </select>
                            </label>
                            <div className="encounter-control-group">
                              <span>Creatures</span>
                              <Stepper
                                label={`creatures in row ${index + 1}`}
                                value={opponent.quantity}
                                minimum={1}
                                maximum={99}
                                onChange={(quantity) => updateOpponent(opponent.id, { quantity })}
                              />
                            </div>
                            <div className="encounter-row-total">
                              <span>{formatXp(eachXp)} XP each</span>
                              <strong>{formatXp(xpForOpponent(opponent))} XP</strong>
                            </div>
                            <button
                              className="encounter-remove"
                              type="button"
                              aria-label={`Remove creature row ${index + 1}`}
                              onClick={() => setState((current) => ({
                                ...current,
                                opponents: current.opponents.filter((item) => item.id !== opponent.id),
                              }))}
                            >Remove</button>
                          </div>
                          {opponent.cr === "0" ? (
                            <fieldset className="encounter-cr-zero">
                              <legend>CR 0 XP value</legend>
                              {[0, 10].map((xp) => (
                                <button
                                  className={opponent.cr0Xp === xp ? "active" : ""}
                                  type="button"
                                  aria-pressed={opponent.cr0Xp === xp}
                                  key={xp}
                                  onClick={() => updateOpponent(opponent.id, { cr0Xp: xp as 0 | 10 })}
                                >{xp} XP</button>
                              ))}
                            </fieldset>
                          ) : null}
                        </article>
                      );
                    }) : (
                      <div className="encounter-empty">No opponents yet. Add creatures to start calculating.</div>
                    )}
                  </div>
                </section>
              </div>

              <aside className="encounter-results" aria-live="polite">
                <span className="encounter-eyebrow">Estimated difficulty</span>
                <div className={`encounter-difficulty encounter-difficulty-${result.difficulty.toLowerCase().replace(" ", "-")}`}>
                  {result.difficulty}
                </div>
                <div className="encounter-total">
                  <span>Total opponent XP</span>
                  <strong>{formatXp(result.totalXp)}</strong>
                </div>
                <div className="encounter-budget-list">
                  {budgetRows.map(([label, budget]) => (
                    <div className="encounter-budget" key={label}>
                      <div><span>{label}</span><strong>{formatXp(budget)} XP</strong></div>
                      <progress max={budget} value={Math.min(result.totalXp, budget)} aria-label={`${label} XP budget`} />
                    </div>
                  ))}
                </div>
                <p className="encounter-distance">
                  {result.isOverTarget
                    ? `${formatXp(result.budgetDifference)} XP above the High budget.`
                    : `${formatXp(result.budgetDifference)} XP remaining in the ${result.difficulty} budget.`}
                </p>
                {result.tooManyCreatures || result.hasOverLevelCr ? (
                  <div className="encounter-warnings" role="note">
                    {result.tooManyCreatures ? <p><strong>Many creatures:</strong> More than two opponents per hero can be less predictable.</p> : null}
                    {result.hasOverLevelCr ? <p><strong>Powerful creature:</strong> A CR above party level might take out a hero with one action.</p> : null}
                  </div>
                ) : null}
                <p className="encounter-caveat">
                  This is an estimate, not a guarantee. Terrain, tactics, unusual features, and party resources can change the result. Based on the{" "}
                  <a href="https://www.dndbeyond.com/sources/dnd/br-2024/dms-toolbox#CombatEncounterDifficulty" target="_blank" rel="noreferrer">2024 D&amp;D rules</a>.
                </p>
              </aside>
            </div>

            <footer className="encounter-actions">
              <button
                className="button ghost"
                type="button"
                onClick={() => setState(createDefaultEncounter(newGroupId()) as EncounterState)}
              >Reset</button>
              <button className="button primary" type="button" onClick={close}>Done</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export default EncounterCalculatorLauncher;
