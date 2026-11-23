import React, { useEffect, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Cpu,
  GitCommitHorizontal,
  Activity,
  Box,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

export interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
  onOpenAcademy: () => void;
}

interface TutorialStep {
  title: string;
  subtitle: string;
  accent: string;
  icon: React.ReactNode;
  bullets: { heading: string; text: string }[];
  tip: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: '1. Eleman Seç & Yerleştir',
    subtitle: '25 gerçek elektronik bileşen parmaklarınızın ucunda',
    accent: '#22d3ee',
    icon: <Cpu size={22} color="#22d3ee" />,
    bullets: [
      {
        heading: 'Sol Bileşen Paleti',
        text: 'Direnç (R), Kapasitör (C), LED, Transistör (NPN/MOSFET), Op-Amp ve Güç Kaynakları kategoriler halinde listelenir.',
      },
      {
        heading: 'Yeni Başlayan Rehberi',
        text: 'Herhangi bir bileşenin üzerine fareyle geldiğinizde alttaki bilgi kartında o elemanın gerçek hayatta ne işe yaradığını anında görürsünüz.',
      },
      {
        heading: 'Yerleştirme & Döndürme',
        text: 'Bileşeni seçip 2D şemaya tıklayın. Yerleştirmeden önce veya seçiliyken R tuşuna basarak 90° döndürebilirsiniz.',
      },
    ],
    tip: 'İpucu: Her devrede voltaj referansı için en az bir adet GND (Toprak) bulunmalıdır.',
  },
  {
    title: '2. Kablo Çekme & Değer Değiştirme',
    subtitle: 'Gerçek mühendislik birimleriyle anlık devre düzenleme',
    accent: '#34d399',
    icon: <GitCommitHorizontal size={22} color="#34d399" />,
    bullets: [
      {
        heading: 'Kablo Aracı (WIRE)',
        text: '2D modda W tuşuna basarak (veya sol panelden WIRE seçerek) iki pin arasında temiz dik açılı (L-şekilli) kablo çekebilirsiniz.',
      },
      {
        heading: 'SI Birimleriyle Değer Girme',
        text: 'Sağdaki Inspector panelinde 10k (10.000 Ω), 220 (220 Ω), 100n (100 nF) veya 4.7u gibi standart kısaltmaları doğrudan yazabilirsiniz.',
      },
      {
        heading: 'Canlı Potansiyometre & LED',
        text: 'Potansiyometreyi seçtiğinizde çıkan sürgüyü (%1–%99) kaydırarak voltaj bölücüyü ve LED parlaklığını anlık gözlemleyin.',
      },
    ],
    tip: 'İpucu: Yanlış kablo veya elemanı seçip Delete tuşuyla (veya DEL aracıyla) kolayca silebilirsiniz.',
  },
  {
    title: '3. Canlı Osiloskop & Bode Diyagramı',
    subtitle: 'Gerçek SPICE (MNA + Newton-Raphson) fizik motoru',
    accent: '#fbbf24',
    icon: <Activity size={22} color="#fbbf24" />,
    bullets: [
      {
        heading: '4 Analiz Modu',
        text: 'Üst çubuktan Transient (Zaman dalga formu), AC Bode (Frekans & Faz tepkisi), DC Sweep (Transfer eğrisi) ve DC OP (Düğüm voltaj/akım tablosu) arasında geçiş yapın.',
      },
      {
        heading: 'Voltaj Probları (PRB)',
        text: 'Şemadaki herhangi bir noktaya PRB aracıyla prob koyarak o düğümün sinyalini renkli kanal olarak osiloskopta izleyin.',
      },
      {
        heading: 'Otomatik Ölçümler',
        text: 'Grafik üzerinde fareyi gezdirerek tam zaman/frekans değerlerini okuyun; üst şeritte Vpp, Vrms, Peak Gain ve -3 dB kesim frekansı otomatik hesaplanır.',
      },
    ],
    tip: 'İpucu: Şema üzerindeki "DC Bias ON" düğmesi tüm düğüm voltajlarını canlı etiket olarak gösterir.',
  },
  {
    title: '4. 3D PCB Laboratuvarında Gezinme',
    subtitle: 'Devrenizi gerçekçi 3D baskı devre kartı üzerinde inceleyin',
    accent: '#a78bfa',
    icon: <Box size={22} color="#a78bfa" />,
    bullets: [
      {
        heading: 'Kamera & Klavye Hareketi',
        text: 'Sol tık + sürükle ile döndürün, tekerlekle yakınlaşın. 3D veya Split modda WASD ve Ok Tuşları (↑↓←→) ile kart üzerinde serbestçe gezinin.',
      },
      {
        heading: 'Gerçekçi Fizik Görselleştirme',
        text: 'Dirençlerin üzerinde gerçek EIA renk bantları (ör. 1kΩ = Kahve-Siyah-Kırmızı) otomatik çizilir; LED ve lambalar geçen akıma göre gerçek ışık yayar.',
      },
      {
        heading: 'Termal Kamera & Akım Akışı',
        text: '3D panelindeki Termal Kamera moduyla ısınan elemanları görün, akım akış animasyonuyla elektron/akım yönünü canlı takip edin.',
      },
    ],
    tip: 'İpucu: 3D kartta herhangi bir bileşene tıkladığınızda sağdaki Inspector panelinde o eleman otomatik seçilir.',
  },
  {
    title: '5. 50 Seviyelik Elektronik Akademisi',
    subtitle: 'Sıfırdan uygulamalı devre tasarımına adım adım uzmanlaşın',
    accent: '#34d399',
    icon: <GraduationCap size={22} color="#34d399" />,
    bullets: [
      {
        heading: '10 Bölüm · 50 Gerçek Görev',
        text: 'Ohm Yasası ve LED sürmeden başlayıp voltaj bölücüler, RC filtreler, Zener regülatörler, BJT/MOSFET anahtarlama ve Op-Amp yükselteçlere kadar ilerleyin.',
      },
      {
        heading: 'Gerçek SPICE Otomatik Doğrulama',
        text: '"Devreyi Test Et & Doğrula" butonuna bastığınızda kurduğunuz devre gerçek SPICE motoruyla çözülür, ölçülen ve hedeflenen değerler karşılaştırılır.',
      },
      {
        heading: 'İpucu & Anında Çözüm',
        text: 'Takıldığınızda adım adım ipucuna bakabilir veya "Çözümü Uygula" butonuyla çalışan devreyi 2D/3D üzerinde inceleyebilirsiniz.',
      },
    ],
    tip: 'İlerleyişiniz tarayıcıda otomatik kaydedilir — hemen 1. seviyeden başlayabilirsiniz!',
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({
  open,
  onClose,
  onOpenAcademy,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setStepIdx((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setStepIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = TUTORIAL_STEPS[stepIdx];
  const isLast = stepIdx === TUTORIAL_STEPS.length - 1;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(5, 9, 16, 0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 660,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--bg-panel-alt)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: `${step.accent}1c`,
                border: `1px solid ${step.accent}66`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {step.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: step.accent,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Hızlı Başlangıç Rehberi · Adım {stepIdx + 1} / {TUTORIAL_STEPS.length}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                {step.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            title="Kapat (Esc)"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Step Progress Pills */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '12px 20px 0',
          }}
        >
          {TUTORIAL_STEPS.map((s, idx) => (
            <button
              key={s.title}
              onClick={() => setStepIdx(idx)}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 999,
                background: idx <= stepIdx ? step.accent : 'var(--border-subtle)',
                opacity: idx === stepIdx ? 1 : idx < stepIdx ? 0.55 : 0.6,
                transition: 'all 0.15s ease',
              }}
              title={s.title}
            />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {step.subtitle}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {step.bullets.map((b) => (
              <div
                key={b.heading}
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 9,
                  padding: '11px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 3,
                  }}
                >
                  {b.heading}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {b.text}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 9,
              padding: '10px 13px',
              borderRadius: 8,
              background: `${step.accent}14`,
              border: `1px solid ${step.accent}44`,
              fontSize: 13,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            <Sparkles size={16} color={step.accent} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{step.tip}</span>
          </div>
        </div>

        {/* Footer Controls */}
        <div
          style={{
            padding: '13px 20px',
            background: 'var(--bg-panel-alt)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <button
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 13px',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-strong)',
              color: stepIdx === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              opacity: stepIdx === 0 ? 0.5 : 1,
              cursor: stepIdx === 0 ? 'default' : 'pointer',
            }}
          >
            <ChevronLeft size={15} />
            Önceki
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isLast && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAcademy();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 15px',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'rgba(52, 211, 153, 0.2)',
                  border: '1px solid rgba(52, 211, 153, 0.65)',
                  color: 'var(--accent-emerald)',
                }}
              >
                <GraduationCap size={16} />
                50 Level Akademiyi Aç
              </button>
            )}

            {isLast ? (
              <button
                onClick={onClose}
                style={{
                  padding: '8px 18px',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'var(--accent-cyan)',
                  color: '#071018',
                }}
              >
                Başla
              </button>
            ) : (
              <button
                onClick={() => setStepIdx((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '8px 16px',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'var(--accent-cyan)',
                  color: '#071018',
                }}
              >
                Sonraki
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
