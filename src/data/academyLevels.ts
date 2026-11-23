import { AcademyLevel, AcademyProgress } from '../types/academy';
import { ACADEMY_LEVELS_PART1 } from './academyLevelsPart1';
import { ACADEMY_LEVELS_PART2 } from './academyLevelsPart2';

export interface AcademyChapterMeta {
  chapter: number;
  title: string;
  difficulty: AcademyLevel['difficulty'];
  description: string;
  levelRange: [number, number];
}

export const ACADEMY_CHAPTERS: AcademyChapterMeta[] = [
  {
    chapter: 1,
    title: 'DC Devre Temelleri & Ohm Yasası',
    difficulty: 'Başlangıç',
    description: 'Gerilim, akım, direnç, Ohm yasası, güç ve seri devre temelleri.',
    levelRange: [1, 5],
  },
  {
    chapter: 2,
    title: 'Gerilim Bölücüler, Kirchhoff & Potansiyometreler',
    difficulty: 'Başlangıç',
    description: 'Paralel kollar, KVL/KCL, gerilim bölücü sensör arayüzleri ve sigorta koruması.',
    levelRange: [6, 10],
  },
  {
    chapter: 3,
    title: 'Kondansatörler, Bobinler & Zaman Sabitleri',
    difficulty: 'Temel',
    description: 'RC ve RL geçici tepkileri, şarj/deşarj eğrileri ve zaman sabiti τ.',
    levelRange: [11, 15],
  },
  {
    chapter: 4,
    title: 'AC Devreler, Filtreler & Rezonans',
    difficulty: 'Temel',
    description: 'AC frekans tepkisi, alçak/yüksek geçiren RC filtreler ve seri RLC rezonansı.',
    levelRange: [16, 20],
  },
  {
    chapter: 5,
    title: 'Diyotlar, LED’ler & Zener Regülasyonu',
    difficulty: 'Temel',
    description: 'Yarı iletken PN eklemi, LED akım sınırlama, yarım dalga ve Zener regülatör.',
    levelRange: [21, 25],
  },
  {
    chapter: 6,
    title: 'Güç Elektroniği: Doğrultma & Anahtarlama',
    difficulty: 'Orta-Alt',
    description: 'Tam dalga köprü doğrultucu, ripple filtreleme, trafolu güç kaynağı, kırpıcı ve röle anahtarı.',
    levelRange: [26, 30],
  },
  {
    chapter: 7,
    title: 'BJT Transistörler: NPN & PNP',
    difficulty: 'Orta-Alt',
    description: 'NPN LED anahtarı, doyum hesabı, emiter takipçi, CE Q-noktası ve yüksek taraf PNP.',
    levelRange: [31, 35],
  },
  {
    chapter: 8,
    title: 'MOSFET & Dijital CMOS Elektroniği',
    difficulty: 'Orta',
    description: 'NMOS eşik gerilimi, güç anahtarlama, PWM sürücü, PMOS ve CMOS DEĞİL kapısı.',
    levelRange: [36, 40],
  },
  {
    chapter: 9,
    title: 'Op-Amp Analog Devre Tasarımı',
    difficulty: 'Orta',
    description: 'Gerilim izleyici, eviren/evirmeyen yükselteçler, ray doyumu ve 20 dB ses ön yükselteci.',
    levelRange: [41, 45],
  },
  {
    chapter: 10,
    title: 'Orta Seviye Bitirme Projeleri',
    difficulty: 'Orta',
    description: 'Aktif LPF, Sallen-Key Butterworth, BJT ses yükselteci, VCCS ve tamponlu 5.1V güç referansı.',
    levelRange: [46, 50],
  },
];

export const ACADEMY_LEVELS: AcademyLevel[] = [
  ...ACADEMY_LEVELS_PART1,
  ...ACADEMY_LEVELS_PART2,
];

export function getLevelById(id: number): AcademyLevel | undefined {
  return ACADEMY_LEVELS.find((level) => level.id === id);
}

const PROGRESS_STORAGE_KEY = 'neonspice_academy_progress_v2';

function sanitizeIdList(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr.filter(
        (n): n is number =>
          typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 50
      )
    )
  ).sort((a, b) => a - b);
}

function createDefaultProgress(): AcademyProgress {
  return {
    completedIds: [],
    challengeCompletedIds: [],
    quizPassedIds: [],
    currentLevelId: 1,
    mode: 'tutorial',
    lastUpdated: new Date().toISOString(),
  };
}

export function loadAcademyProgress(): AcademyProgress {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createDefaultProgress();
  }
  try {
    const raw =
      window.localStorage.getItem(PROGRESS_STORAGE_KEY) ??
      window.localStorage.getItem('neonspice_academy_progress_v1');
    if (!raw) return createDefaultProgress();
    const parsed = JSON.parse(raw) as Partial<AcademyProgress>;
    const completedIds = sanitizeIdList(parsed.completedIds);
    const challengeCompletedIds = sanitizeIdList(parsed.challengeCompletedIds);
    const quizPassedIds = sanitizeIdList(parsed.quizPassedIds);
    const currentLevelId =
      typeof parsed.currentLevelId === 'number' &&
      Number.isInteger(parsed.currentLevelId) &&
      parsed.currentLevelId >= 1 &&
      parsed.currentLevelId <= 50
        ? parsed.currentLevelId
        : 1;
    const mode = parsed.mode === 'challenge' ? 'challenge' : 'tutorial';
    const lastUpdated =
      typeof parsed.lastUpdated === 'string'
        ? parsed.lastUpdated
        : new Date().toISOString();
    return {
      completedIds,
      challengeCompletedIds,
      quizPassedIds,
      currentLevelId,
      mode,
      lastUpdated,
    };
  } catch {
    return createDefaultProgress();
  }
}

export function saveAcademyProgress(progress: AcademyProgress): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const payload: AcademyProgress = {
      completedIds: sanitizeIdList(progress.completedIds),
      challengeCompletedIds: sanitizeIdList(progress.challengeCompletedIds),
      quizPassedIds: sanitizeIdList(progress.quizPassedIds),
      currentLevelId: progress.currentLevelId,
      mode: progress.mode === 'challenge' ? 'challenge' : 'tutorial',
      lastUpdated: new Date().toISOString(),
    };
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / privacy mode failures gracefully
  }
}

export function resetAcademyProgress(): AcademyProgress {
  const fresh = createDefaultProgress();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(PROGRESS_STORAGE_KEY);
      window.localStorage.removeItem('neonspice_academy_progress_v1');
    } catch {
      // Ignore storage failures
    }
  }
  return fresh;
}
