import {
  AnalysisConfig,
  CircuitSchematic,
  DCOPResult,
  SimulationResult,
} from './circuit';

export interface LevelCheckResult {
  passed: boolean;
  summary: string;
  details: { label: string; actual: string; target: string; ok: boolean }[];
}

export interface AcademyLevel {
  id: number; // 1 .. 50
  chapter: number; // 1 .. 10
  chapterTitle: string;
  title: string;
  difficulty: 'Başlangıç' | 'Temel' | 'Orta-Alt' | 'Orta';
  /** Clear, friendly Turkish explanation of what this circuit does in real life */
  concept: string;
  /** Step-by-step instructions the user follows */
  steps: string[];
  /** Actionable goal statement */
  goalText: string;
  /** Helpful hint if the user gets stuck */
  hint: string;
  /** Real-world breadboard / practical engineering note */
  realWorldNote: string;
  /** Starter circuit loaded when the user opens this level */
  starterSchematic: CircuitSchematic;
  /** Verified solution circuit (used for "Çözümü Göster" and automated 50/50 SPICE tests) */
  solutionSchematic: CircuitSchematic;
  /** Analysis mode used to grade this level */
  verificationAnalysis: AnalysisConfig;
  /** Automated real-SPICE physics check */
  verify: (
    dcOp: DCOPResult,
    simResult: SimulationResult,
    schematic: CircuitSchematic
  ) => LevelCheckResult;
}

export interface AcademyProgress {
  completedIds: number[];
  currentLevelId: number;
  lastUpdated: string;
}
