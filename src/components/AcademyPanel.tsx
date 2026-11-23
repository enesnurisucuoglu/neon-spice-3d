import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GraduationCap,
  X,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Zap,
  RotateCcw,
  ArrowRight,
  Compass,
  Flame,
  Target,
  Wrench,
  Trophy,
  Star,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import {
  AcademyLevel,
  AcademyMode,
  AcademyProgress,
  GuidedStep,
  LevelCheckResult,
} from '../types/academy';
import { CircuitSchematic } from '../types/circuit';
import { runSimulation, solveDCOP } from '../engine';
import { verifyChallengeCircuit } from '../data/academyGuidedEngine';
import { getQuizForLevel } from '../data/academyQuizzes';

export interface AcademyPanelProps {
  open: boolean;
  levels: AcademyLevel[];
  progress: AcademyProgress;
  activeLevel: AcademyLevel;
  mode: AcademyMode;
  guidedSteps: GuidedStep[];
  activeGuidedStep: GuidedStep | null;
  currentSchematic: CircuitSchematic;
  onClose: () => void;
  onSelectLevel: (level: AcademyLevel, overrideMode?: AcademyMode) => void;
  onChangeMode: (mode: AcademyMode) => void;
  onApplySolution: (level: AcademyLevel) => void;
  onResetLevel: (level: AcademyLevel) => void;
  onMarkCompleted: (levelId: number, mode: AcademyMode) => void;
  onMarkQuizPassed: (levelId: number) => void;
}

const DIFFICULTY_STYLES: Record<
  AcademyLevel['difficulty'],
  { bg: string; border: string; color: string }
> = {
  Başlangıç: {
    bg: 'rgba(52, 211, 153, 0.16)',
    border: 'rgba(52, 211, 153, 0.45)',
    color: '#34d399',
  },
  Temel: {
    bg: 'rgba(34, 211, 238, 0.16)',
    border: 'rgba(34, 211, 238, 0.45)',
    color: '#22d3ee',
  },
  'Orta-Alt': {
    bg: 'rgba(251, 191, 36, 0.16)',
    border: 'rgba(251, 191, 36, 0.45)',
    color: '#fbbf24',
  },
  Orta: {
    bg: 'rgba(167, 139, 250, 0.18)',
    border: 'rgba(167, 139, 250, 0.5)',
    color: '#c4b5fd',
  },
};

export const AcademyPanel: React.FC<AcademyPanelProps> = ({
  open,
  levels,
  progress,
  activeLevel,
  mode,
  guidedSteps,
  activeGuidedStep,
  currentSchematic,
  onClose,
  onSelectLevel,
  onChangeMode,
  onApplySolution,
  onResetLevel,
  onMarkCompleted,
  onMarkQuizPassed,
}) => {
  const [selectedChapter, setSelectedChapter] = useState<number>(activeLevel.chapter);
  const [showHint, setShowHint] = useState(false);
  const [checkResult, setCheckResult] = useState<LevelCheckResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Mini-Quiz state for current level
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);
  const autoVerifiedRef = useRef<string>('');

  // Reset transient state whenever level or mode changes
  useEffect(() => {
    setSelectedChapter(activeLevel.chapter);
    setShowHint(false);
    setCheckResult(null);
    setVerifyError(null);
    setSelectedQuizOption(null);
    autoVerifiedRef.current = '';
  }, [activeLevel.id, activeLevel.chapter, mode]);

  const chapters = useMemo(() => {
    const map = new Map<number, { chapter: number; title: string; levels: AcademyLevel[] }>();
    for (const lvl of levels) {
      const existing = map.get(lvl.chapter);
      if (existing) {
        existing.levels.push(lvl);
      } else {
        map.set(lvl.chapter, { chapter: lvl.chapter, title: lvl.chapterTitle, levels: [lvl] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.chapter - b.chapter);
  }, [levels]);

  const completedSet = useMemo(() => new Set(progress.completedIds), [progress.completedIds]);
  const challengeSet = useMemo(
    () => new Set(progress.challengeCompletedIds ?? []),
    [progress.challengeCompletedIds]
  );
  const quizPassedSet = useMemo(
    () => new Set(progress.quizPassedIds ?? []),
    [progress.quizPassedIds]
  );

  const chapterLevels = useMemo(
    () => chapters.find((c) => c.chapter === selectedChapter)?.levels ?? [],
    [chapters, selectedChapter]
  );

  const nextLevel = useMemo(
    () => levels.find((l) => l.id === activeLevel.id + 1) ?? null,
    [levels, activeLevel.id]
  );

  const quiz = useMemo(() => getQuizForLevel(activeLevel.id), [activeLevel.id]);

  const runVerification = React.useCallback(() => {
    try {
      setVerifyError(null);
      const dcOp = solveDCOP(currentSchematic);
      const simResult =
        activeLevel.verificationAnalysis.type === 'dc_op'
          ? dcOp
          : runSimulation(currentSchematic, activeLevel.verificationAnalysis);
      const res =
        mode === 'challenge'
          ? verifyChallengeCircuit(activeLevel, dcOp, simResult, currentSchematic)
          : activeLevel.verify(dcOp, simResult, currentSchematic);
      setCheckResult(res);
      if (res.passed) {
        onMarkCompleted(activeLevel.id, mode);
      }
    } catch (err) {
      setCheckResult(null);
      setVerifyError(
        err instanceof Error
          ? err.message
          : 'Devre simüle edilirken hata oluştu. Bağlantıları ve GND düğümünü kontrol edin.'
      );
    }
  }, [activeLevel, currentSchematic, mode, onMarkCompleted]);

  // Auto-trigger verification in Tutorial mode once all build steps reach the final 'verify' step
  const buildSteps = useMemo(
    () => guidedSteps.filter((s) => s.kind !== 'verify'),
    [guidedSteps]
  );
  const completedBuildCount = useMemo(
    () => buildSteps.filter((s) => s.completed).length,
    [buildSteps]
  );
  const allBuildDone = buildSteps.length > 0 && completedBuildCount === buildSteps.length;

  useEffect(() => {
    if (!open || mode !== 'tutorial' || !allBuildDone || checkResult?.passed) return;
    const key = `${activeLevel.id}-${currentSchematic.components.length}-${currentSchematic.wires.length}-${currentSchematic.probes.length}`;
    if (autoVerifiedRef.current === key) return;
    autoVerifiedRef.current = key;
    runVerification();
  }, [
    open,
    mode,
    allBuildDone,
    checkResult?.passed,
    activeLevel.id,
    currentSchematic.components.length,
    currentSchematic.wires.length,
    currentSchematic.probes.length,
    runVerification,
  ]);

  if (!open) return null;

  const totalCount = levels.length || 50;
  const completedCount = progress.completedIds.length;
  const pct = Math.round((completedCount / totalCount) * 100);
  const diffStyle = DIFFICULTY_STYLES[activeLevel.difficulty] ?? DIFFICULTY_STYLES['Temel'];

  const totalSteps = Math.max(1, guidedSteps.length);
  const doneSteps = guidedSteps.filter((s) => s.completed).length;
  const currentStepNumber = Math.min(totalSteps, doneSteps + 1);
  const stepPct = Math.round((doneSteps / totalSteps) * 100);

  return (
    <aside
      style={{
        width: 382,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-strong)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        boxShadow: '6px 0 24px rgba(0, 0, 0, 0.35)',
        zIndex: 20,
      }}
    >
      {/* Top Academy Header & Progress */}
      <div
        style={{
          padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(167,139,250,0.14), rgba(34,211,238,0.08))',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCap size={19} color="#c4b5fd" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', lineHeight: 1.15 }}>
                Elektronik Akademisi
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Tamamlanan: {completedCount}/{totalCount} ({pct}%) · ★ {challengeSet.size}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            title="Akademi Panelini Kapat"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            height: 7,
            width: '100%',
            borderRadius: 999,
            background: 'rgba(7, 11, 20, 0.85)',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #22d3ee, #34d399)',
              boxShadow: '0 0 10px rgba(34, 211, 238, 0.45)',
              borderRadius: 999,
              transition: 'width 0.25s ease',
            }}
          />
        </div>

        {/* Chapter Selector + Level Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <select
            value={selectedChapter}
            onChange={(e) => {
              const ch = Number(e.target.value);
              setSelectedChapter(ch);
              const firstInCh = chapters.find((c) => c.chapter === ch)?.levels[0];
              if (firstInCh) onSelectLevel(firstInCh);
            }}
            style={{
              width: '100%',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              padding: '6px 10px',
              background: 'rgba(7, 11, 20, 0.82)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              color: 'var(--text-primary)',
            }}
          >
            {chapters.map((ch) => {
              const doneInCh = ch.levels.filter((l) => completedSet.has(l.id)).length;
              return (
                <option key={ch.chapter} value={ch.chapter}>
                  Bölüm {ch.chapter}: {ch.title} ({doneInCh}/{ch.levels.length})
                </option>
              );
            })}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
            {chapterLevels.map((lvl) => {
              const isActive = lvl.id === activeLevel.id;
              const isDone = completedSet.has(lvl.id);
              const isChallengeDone = challengeSet.has(lvl.id);
              return (
                <button
                  key={lvl.id}
                  onClick={() => onSelectLevel(lvl)}
                  className={isActive ? undefined : 'ns-btn'}
                  title={`Level ${lvl.id}: ${lvl.title}${isDone ? ' (Tutorial ✓)' : ''}${
                    isChallengeDone ? ' (Kendin Dene ★)' : ''
                  }`}
                  style={{
                    height: 31,
                    borderRadius: 8,
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(34,211,238,0.24), rgba(59,130,246,0.18))'
                      : isDone || isChallengeDone
                      ? 'rgba(52, 211, 153, 0.14)'
                      : 'rgba(7, 11, 20, 0.72)',
                    border: `1.5px solid ${
                      isActive
                        ? '#22d3ee'
                        : isChallengeDone
                        ? '#fbbf24'
                        : isDone
                        ? 'rgba(52, 211, 153, 0.5)'
                        : 'var(--border-subtle)'
                    }`,
                    color: isActive ? '#67e8f9' : isDone ? '#34d399' : 'var(--text-secondary)',
                    boxShadow: isActive ? '0 0 10px rgba(34, 211, 238, 0.25)' : 'none',
                  }}
                >
                  <span>L{lvl.id}</span>
                  {isDone && <span style={{ color: '#34d399', fontSize: 10 }}>✓</span>}
                  {isChallengeDone && <span style={{ color: '#fbbf24', fontSize: 10 }}>★</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scrollable Level Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '13px 14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Mode Switcher Tabs: Tutorial vs Kendin Dene */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 3,
            padding: 3,
            borderRadius: 10,
            background: 'rgba(7, 11, 20, 0.82)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            onClick={() => onChangeMode('tutorial')}
            className={mode === 'tutorial' ? undefined : 'ns-btn'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 6px',
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 700,
              background:
                mode === 'tutorial'
                  ? 'linear-gradient(135deg, #22d3ee, #34d399)'
                  : 'transparent',
              color: mode === 'tutorial' ? '#04111b' : 'var(--text-secondary)',
              boxShadow: mode === 'tutorial' ? '0 2px 10px rgba(34, 211, 238, 0.3)' : 'none',
            }}
          >
            <Compass size={14} />
            Tutorial
          </button>

          <button
            onClick={() => onChangeMode('challenge')}
            className={mode === 'challenge' ? undefined : 'ns-btn'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 6px',
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 700,
              background:
                mode === 'challenge'
                  ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                  : 'transparent',
              color: mode === 'challenge' ? '#04111b' : 'var(--text-secondary)',
              boxShadow: mode === 'challenge' ? '0 2px 10px rgba(245, 158, 11, 0.32)' : 'none',
            }}
          >
            <Flame size={14} />
            Kendin Dene
          </button>
        </div>

        {/* Level Title + Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                background: 'rgba(34, 211, 238, 0.14)',
                border: '1px solid rgba(34, 211, 238, 0.4)',
                color: 'var(--accent-cyan)',
              }}
            >
              LEVEL {activeLevel.id} · BÖLÜM {activeLevel.chapter}
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: diffStyle.bg,
                border: `1px solid ${diffStyle.border}`,
                color: diffStyle.color,
              }}
            >
              {activeLevel.difficulty}
            </span>
            {challengeSet.has(activeLevel.id) && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(251, 191, 36, 0.18)',
                  color: '#fbbf24',
                }}
              >
                <Star size={11} fill="#fbbf24" /> Yardımsız
              </span>
            )}
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3 }}>
            {activeLevel.title}
          </h3>
        </div>

        {/* ================ COMPLETION SUMMARY + MINI-QUIZ ================ */}
        {checkResult?.passed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Celebratory Banner + Measured Values */}
            <div
              style={{
                borderRadius: 10,
                border: '1.5px solid #34d399',
                background: 'linear-gradient(180deg, rgba(16,185,129,0.2) 0%, rgba(11,15,23,0.92) 100%)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '11px 13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  fontWeight: 800,
                  fontSize: 14,
                  color: '#6ee7b7',
                  borderBottom: '1px solid rgba(52, 211, 153, 0.25)',
                }}
              >
                <Trophy size={18} color="#34d399" />
                <span>
                  {mode === 'challenge'
                    ? 'Harika! Yardımsız Tamamladın! ★'
                    : 'Tebrikler! Devre Doğrulandı! 🎉'}
                </span>
              </div>

              <div style={{ padding: '9px 12px', fontSize: 12.5, color: '#d1fae5' }}>
                {checkResult.summary}
              </div>

              {checkResult.details.length > 0 && (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 10px' }}>Ölçüm</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px' }}>Ölçülen</th>
                      <th style={{ textAlign: 'right', padding: '5px 10px' }}>Hedef</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkResult.details.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text-primary)' }}>
                          <span style={{ color: '#34d399', marginRight: 5 }}>✓</span>
                          {row.label}
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                          {row.actual}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {row.target}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Devre Özeti */}
            <div
              style={{
                background: 'var(--bg-panel-alt)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 9,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--accent-cyan)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <Sparkles size={13} />
                DEVRE ÖZETİ &amp; GERÇEK DÜNYA NOTU
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.55 }}>
                {activeLevel.concept}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 6,
                }}
              >
                <strong style={{ color: 'var(--accent-amber)' }}>Breadboard Notu:</strong>{' '}
                {activeLevel.realWorldNote}
              </p>
            </div>

            {/* Mini-Quiz Card */}
            {quiz && (
              <div
                style={{
                  background: 'linear-gradient(180deg, rgba(167,139,250,0.12) 0%, rgba(15,23,42,0.9) 100%)',
                  border: '1px solid rgba(167, 139, 250, 0.45)',
                  borderRadius: 9,
                  padding: '11px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#c4b5fd',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <HelpCircle size={13} />
                    MİNİ QUIZ
                  </span>
                  {quizPassedSet.has(activeLevel.id) && (
                    <span style={{ color: '#34d399' }}>✓ Geçildi</span>
                  )}
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', lineHeight: 1.45 }}>
                  {quiz.question}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {quiz.options.map((opt, idx) => {
                    const isPicked = selectedQuizOption === idx;
                    const isCorrect = idx === quiz.correctIndex;
                    let bg = 'var(--bg-app)';
                    let border = 'var(--border-subtle)';
                    let color = 'var(--text-primary)';
                    if (selectedQuizOption !== null) {
                      if (isPicked && isCorrect) {
                        bg = 'rgba(52, 211, 153, 0.22)';
                        border = '#34d399';
                        color = '#a7f3d0';
                      } else if (isPicked && !isCorrect) {
                        bg = 'rgba(251, 113, 133, 0.22)';
                        border = '#fb7185';
                        color = '#fecdd3';
                      } else if (isCorrect && selectedQuizOption === quiz.correctIndex) {
                        bg = 'rgba(52, 211, 153, 0.14)';
                        border = '#34d399';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        className="ns-quiz-opt"
                        onClick={() => {
                          setSelectedQuizOption(idx);
                          if (idx === quiz.correctIndex) {
                            onMarkQuizPassed(activeLevel.id);
                          }
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '9px 11px',
                          borderRadius: 8,
                          fontSize: 12.5,
                          lineHeight: 1.4,
                          background: bg,
                          border: `1px solid ${border}`,
                          color,
                        }}
                      >
                        <strong style={{ marginRight: 6, fontFamily: 'var(--font-mono)' }}>
                          {String.fromCharCode(65 + idx)})
                        </strong>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {selectedQuizOption !== null && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      lineHeight: 1.5,
                      background:
                        selectedQuizOption === quiz.correctIndex
                          ? 'rgba(52, 211, 153, 0.14)'
                          : 'rgba(251, 113, 133, 0.14)',
                      border: `1px solid ${
                        selectedQuizOption === quiz.correctIndex ? '#34d399' : '#fb7185'
                      }`,
                      color:
                        selectedQuizOption === quiz.correctIndex ? '#d1fae5' : '#fecdd3',
                    }}
                  >
                    <strong>
                      {selectedQuizOption === quiz.correctIndex ? 'Doğru! 🎉 ' : 'Tekrar dene! '}
                    </strong>
                    {selectedQuizOption === quiz.correctIndex
                      ? quiz.explanation
                      : 'Başka bir seçeneği deneyebilirsin.'}
                  </div>
                )}
              </div>
            )}

            {/* Replay & Next Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {nextLevel && (
                <button
                  onClick={() => onSelectLevel(nextLevel)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: 700,
                    background: '#34d399',
                    color: '#051018',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  Sonraki Level: L{nextLevel.id} — {nextLevel.title}
                  <ArrowRight size={15} />
                </button>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  onClick={() => onSelectLevel(activeLevel, 'tutorial')}
                  style={{
                    padding: '8px 8px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--bg-panel-alt)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  Tekrar Çöz (Tutorial)
                </button>
                <button
                  onClick={() => onSelectLevel(activeLevel, 'challenge')}
                  style={{
                    padding: '8px 8px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(251, 191, 36, 0.14)',
                    border: '1px solid rgba(251, 191, 36, 0.5)',
                    color: '#fbbf24',
                  }}
                >
                  Kendin Dene (Yardımsız)
                </button>
              </div>
            </div>
          </div>
        ) : mode === 'tutorial' ? (
          /* ================ TUTORIAL MODE (STEP-BY-STEP GUIDED) ================ */
          <>
            {/* Live Step Progress Bar */}
            <div
              style={{
                background: 'var(--bg-panel-alt)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '9px 11px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                  ADIM {currentStepNumber} / {totalSteps}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{stepPct}% tamamlandı</span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--bg-app)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${stepPct}%`,
                    background: 'linear-gradient(90deg, #22d3ee, #34d399)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>

            {/* Highlighted Active Step Card */}
            {activeGuidedStep && (
              <div
                style={{
                  background: 'linear-gradient(180deg, rgba(34,211,238,0.16) 0%, rgba(15,23,42,0.92) 100%)',
                  border: '1.5px solid rgba(34, 211, 238, 0.65)',
                  borderRadius: 9,
                  padding: '11px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  boxShadow: '0 0 18px rgba(34, 211, 238, 0.14)',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: '#22d3ee',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  ▶ ŞİMDİKİ ADIM
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3 }}>
                  {activeGuidedStep.title}
                </div>
                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
                  {activeGuidedStep.instruction}
                </div>
              </div>
            )}

            {/* All Steps Checklist */}
            <div
              style={{
                background: 'var(--bg-panel-alt)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '9px 11px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                }}
              >
                Kurulum Adımları
              </div>
              {guidedSteps.map((st, idx) => {
                const isCurrent = activeGuidedStep?.id === st.id;
                return (
                  <div
                    key={st.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 7,
                      fontSize: 12.5,
                      lineHeight: 1.4,
                      color: st.completed
                        ? '#6ee7b7'
                        : isCurrent
                        ? '#f8fafc'
                        : 'var(--text-muted)',
                      fontWeight: isCurrent ? 600 : 400,
                      opacity: st.completed ? 0.85 : 1,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        marginTop: 1,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: st.completed ? '#34d399' : isCurrent ? '#22d3ee' : 'var(--text-muted)',
                      }}
                    >
                      {st.completed ? '✓' : `${idx + 1}.`}
                    </span>
                    <span style={{ textDecoration: st.completed ? 'line-through' : 'none' }}>
                      {st.title}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Verify + Hint / Solution / Reset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button
                onClick={runVerification}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  color: '#051018',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                }}
              >
                <CheckCircle2 size={16} />
                Devreyi Test Et &amp; Doğrula
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <button
                  onClick={() => setShowHint((v) => !v)}
                  style={{
                    padding: '7px 6px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    background: showHint ? 'rgba(251, 191, 36, 0.2)' : 'var(--bg-panel-alt)',
                    border: `1px solid ${showHint ? '#fbbf24' : 'var(--border-strong)'}`,
                    color: '#fde68a',
                  }}
                >
                  <Lightbulb size={13} />
                  İpucu
                </button>

                <button
                  onClick={() => {
                    onApplySolution(activeLevel);
                    setCheckResult(null);
                  }}
                  style={{
                    padding: '7px 6px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    background: 'rgba(167, 139, 250, 0.14)',
                    border: '1px solid rgba(167, 139, 250, 0.45)',
                    color: '#ddd6fe',
                  }}
                  title="Çalışan çözüm devresini şemaya yükle"
                >
                  <Zap size={13} />
                  Çözüm
                </button>

                <button
                  onClick={() => {
                    onResetLevel(activeLevel);
                    setCheckResult(null);
                  }}
                  style={{
                    padding: '7px 6px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    background: 'var(--bg-panel-alt)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-secondary)',
                  }}
                  title="Kartı temizle ve sıfırdan başla"
                >
                  <RotateCcw size={13} />
                  Sıfırla
                </button>
              </div>
            </div>

            {showHint && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(251, 191, 36, 0.1)',
                  border: '1px solid rgba(251, 191, 36, 0.45)',
                  fontSize: 12.5,
                  color: '#fef3c7',
                  lineHeight: 1.5,
                }}
              >
                <strong>💡 İpucu:</strong> {activeLevel.hint}
              </div>
            )}
          </>
        ) : (
          /* ================ CHALLENGE MODE ("KENDİN DENE" - NO SPOILERS) ================ */
          <>
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(251,191,36,0.12) 0%, rgba(15,23,42,0.92) 100%)',
                border: '1px solid rgba(251, 191, 36, 0.45)',
                borderRadius: 9,
                padding: '12px 13px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: '#fbbf24',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                }}
              >
                <Target size={14} />
                YARDIMSIZ TASARIM GÖREVİ
              </div>

              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f8fafc', lineHeight: 1.5 }}>
                {activeLevel.goalText}
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Boş PCB üzerinde devreyi istediğin sırayla ve düzende kur. Elektriksel davranış hedefi
                sağladığı sürece devren geçerli sayılır!
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button
                onClick={runVerification}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  color: '#0b0f17',
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
                }}
              >
                <CheckCircle2 size={16} />
                Devreyi Kontrol Et
              </button>

              <button
                onClick={() => {
                  onResetLevel(activeLevel);
                  setCheckResult(null);
                }}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: 'var(--bg-panel-alt)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RotateCcw size={13} />
                Kartı Temizle
              </button>
            </div>
          </>
        )}

        {/* Failed Verification Feedback */}
        {verifyError && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(251, 113, 133, 0.14)',
              border: '1px solid rgba(251, 113, 133, 0.5)',
              fontSize: 12.5,
              color: '#fecdd3',
              lineHeight: 1.5,
            }}
          >
            <strong>Simülasyon Hatası:</strong> {verifyError}
          </div>
        )}

        {checkResult && !checkResult.passed && (
          <div
            style={{
              borderRadius: 9,
              border: '1.5px solid #fb7185',
              background: 'rgba(244, 63, 94, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                fontSize: 13,
                color: '#fda4af',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <XCircle size={16} color="#fb7185" />
              <span>{checkResult.summary}</span>
            </div>

            {checkResult.details.length > 0 && (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ textAlign: 'left', padding: '5px 10px' }}>Ölçüm</th>
                    <th style={{ textAlign: 'right', padding: '5px 8px' }}>Ölçülen</th>
                    <th style={{ textAlign: 'right', padding: '5px 10px' }}>Hedef</th>
                  </tr>
                </thead>
                <tbody>
                  {checkResult.details.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '5px 10px', color: 'var(--text-primary)' }}>
                        <span style={{ color: row.ok ? '#34d399' : '#fb7185', marginRight: 5 }}>
                          {row.ok ? '✓' : '✗'}
                        </span>
                        {row.label}
                      </td>
                      <td
                        style={{
                          padding: '5px 8px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: row.ok ? '#34d399' : '#fb7185',
                        }}
                      >
                        {row.actual}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {row.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Breadboard Note (shown in Tutorial mode while building; in passed view it's inside Devre Özeti) */}
        {!checkResult?.passed && mode === 'tutorial' && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '3px solid var(--accent-amber)',
              borderRadius: '0 8px 8px 0',
              padding: '9px 11px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--accent-amber)',
                marginBottom: 4,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Wrench size={12} />
              GERÇEK BREADBOARD NOTU
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {activeLevel.realWorldNote}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
