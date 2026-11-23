import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  X,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Zap,
  RotateCcw,
  ArrowRight,
  Cpu,
  Target,
  Wrench,
  Trophy,
} from 'lucide-react';
import { AcademyLevel, AcademyProgress, LevelCheckResult } from '../types/academy';
import { CircuitSchematic } from '../types/circuit';
import { runSimulation, solveDCOP } from '../engine';

export interface AcademyPanelProps {
  open: boolean;
  levels: AcademyLevel[];
  progress: AcademyProgress;
  activeLevel: AcademyLevel;
  currentSchematic: CircuitSchematic;
  onClose: () => void;
  onSelectLevel: (level: AcademyLevel) => void;
  onApplySolution: (level: AcademyLevel) => void;
  onResetLevel: (level: AcademyLevel) => void;
  onMarkCompleted: (levelId: number) => void;
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
  currentSchematic,
  onClose,
  onSelectLevel,
  onApplySolution,
  onResetLevel,
  onMarkCompleted,
}) => {
  const [selectedChapter, setSelectedChapter] = useState<number>(activeLevel.chapter);
  const [showHint, setShowHint] = useState(false);
  const [checkResult, setCheckResult] = useState<LevelCheckResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Sync chapter selector and clear old check result when active level changes
  useEffect(() => {
    setSelectedChapter(activeLevel.chapter);
    setShowHint(false);
    setCheckResult(null);
    setVerifyError(null);
  }, [activeLevel.id, activeLevel.chapter]);

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

  const chapterLevels = useMemo(
    () => chapters.find((c) => c.chapter === selectedChapter)?.levels ?? [],
    [chapters, selectedChapter]
  );

  const nextLevel = useMemo(
    () => levels.find((l) => l.id === activeLevel.id + 1) ?? null,
    [levels, activeLevel.id]
  );

  if (!open) return null;

  const totalCount = levels.length || 50;
  const completedCount = progress.completedIds.length;
  const pct = Math.round((completedCount / totalCount) * 100);
  const diffStyle = DIFFICULTY_STYLES[activeLevel.difficulty] ?? DIFFICULTY_STYLES['Temel'];

  const handleVerify = () => {
    try {
      setVerifyError(null);
      const dcOp = solveDCOP(currentSchematic);
      const simResult =
        activeLevel.verificationAnalysis.type === 'dc_op'
          ? dcOp
          : runSimulation(currentSchematic, activeLevel.verificationAnalysis);
      const res = activeLevel.verify(dcOp, simResult, currentSchematic);
      setCheckResult(res);
      if (res.passed) {
        onMarkCompleted(activeLevel.id);
      }
    } catch (err) {
      setCheckResult(null);
      setVerifyError(
        err instanceof Error
          ? err.message
          : 'Devre simüle edilirken hata oluştu. Bağlantıları ve GND düğümünü kontrol edin.'
      );
    }
  };

  return (
    <aside
      style={{
        width: 372,
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
                Tamamlanan: {completedCount} / {totalCount} ({pct}%)
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
            background: 'var(--bg-app)',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #a78bfa, #22d3ee, #34d399)',
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
              padding: '6px 9px',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-strong)',
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
              return (
                <button
                  key={lvl.id}
                  onClick={() => onSelectLevel(lvl)}
                  title={`Level ${lvl.id}: ${lvl.title}`}
                  style={{
                    height: 30,
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    background: isActive
                      ? 'rgba(34, 211, 238, 0.22)'
                      : isDone
                      ? 'rgba(52, 211, 153, 0.14)'
                      : 'var(--bg-app)',
                    border: `1.5px solid ${
                      isActive ? '#22d3ee' : isDone ? 'rgba(52, 211, 153, 0.55)' : 'var(--border-subtle)'
                    }`,
                    color: isActive ? '#22d3ee' : isDone ? '#34d399' : 'var(--text-secondary)',
                  }}
                >
                  {isDone && <CheckCircle2 size={12} />}
                  L{lvl.id}
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
        {/* Level Title + Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            {completedSet.has(activeLevel.id) && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(52, 211, 153, 0.18)',
                  color: '#34d399',
                }}
              >
                <CheckCircle2 size={12} /> Tamamlandı
              </span>
            )}
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3 }}>
            {activeLevel.title}
          </h3>
        </div>

        {/* Concept Box */}
        <div
          style={{
            background: 'var(--bg-panel-alt)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
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
              marginBottom: 5,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
            }}
          >
            <Cpu size={13} />
            Gerçek Hayatta Ne İşe Yarar?
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55 }}>
            {activeLevel.concept}
          </p>
        </div>

        {/* Step-by-Step Mission */}
        <div
          style={{
            background: 'var(--bg-panel-alt)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '10px 12px',
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
              fontWeight: 700,
              color: 'var(--accent-emerald)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
            }}
          >
            <Target size={13} />
            Adım Adım Görev
          </div>

          <ol
            style={{
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {activeLevel.steps.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ol>

          <div
            style={{
              marginTop: 2,
              padding: '8px 10px',
              borderRadius: 6,
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#a7f3d0',
              lineHeight: 1.45,
            }}
          >
            🎯 Hedef: {activeLevel.goalText}
          </div>
        </div>

        {/* Primary Verify CTA + Secondary Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <button
            onClick={handleVerify}
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
              title="Seviye başlangıç devresini geri yükle"
            >
              <RotateCcw size={13} />
              Sıfırla
            </button>
          </div>
        </div>

        {/* Hint Box */}
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

        {/* Verification Error */}
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

        {/* Verification Results Table */}
        {checkResult && (
          <div
            style={{
              borderRadius: 9,
              border: `1.5px solid ${checkResult.passed ? '#34d399' : '#fb7185'}`,
              background: checkResult.passed
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(244, 63, 94, 0.1)',
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
                color: checkResult.passed ? '#6ee7b7' : '#fda4af',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {checkResult.passed ? <Trophy size={16} color="#34d399" /> : <XCircle size={16} color="#fb7185" />}
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
                    <th style={{ textAlign: 'left', padding: '6px 10px' }}>Ölçüm</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Ölçülen</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px' }}>Hedef</th>
                  </tr>
                </thead>
                <tbody>
                  {checkResult.details.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>
                        <span style={{ color: row.ok ? '#34d399' : '#fb7185', marginRight: 5 }}>
                          {row.ok ? '✓' : '✗'}
                        </span>
                        {row.label}
                      </td>
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: row.ok ? '#34d399' : '#fb7185',
                        }}
                      >
                        {row.actual}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {row.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {checkResult.passed && nextLevel && (
              <div style={{ padding: '9px 10px' }}>
                <button
                  onClick={() => onSelectLevel(nextLevel)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 7,
                    fontSize: 13,
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
              </div>
            )}
          </div>
        )}

        {/* Next Level Button (always reachable even before pass) */}
        {nextLevel && !checkResult?.passed && (
          <button
            onClick={() => onSelectLevel(nextLevel)}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--bg-app)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            Sonraki Level → (L{nextLevel.id})
          </button>
        )}

        {/* Real-World Breadboard Note */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--accent-amber)',
            borderRadius: '0 8px 8px 0',
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--accent-amber)',
              marginBottom: 4,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Wrench size={13} />
            GERÇEK BREADBOARD NOTU
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {activeLevel.realWorldNote}
          </p>
        </div>
      </div>
    </aside>
  );
};
