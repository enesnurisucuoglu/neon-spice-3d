import {
  AnalysisConfig,
  CircuitComponent,
  CircuitSchematic,
  ComponentType,
  DCOPResult,
  Rotation,
  SimulationResult,
  Wire,
} from './circuit';

export type AcademyMode = 'tutorial' | 'challenge';

export interface LevelCheckResult {
  passed: boolean;
  summary: string;
  details: { label: string; actual: string; target: string; ok: boolean }[];
}

export interface LevelQuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface GuidedTargetGhost {
  kind: 'component' | 'wire' | 'probe';
  componentType?: ComponentType;
  x?: number;
  y?: number;
  rotation?: Rotation;
  label?: string;
  wires?: Wire[];
}

export interface GuidedStep {
  id: string;
  kind: 'place_component' | 'set_param' | 'add_wires' | 'add_probe' | 'verify';
  title: string;
  instruction: string;
  completed: boolean;
  highlightedTool?: 'select' | 'wire' | 'place' | 'probe';
  highlightedComponentType?: ComponentType;
  targetComponentName?: string;
  targetGhost?: GuidedTargetGhost;
  /** Optional target component from solution for quick comparison */
  solutionComponent?: CircuitComponent;
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
  /** Starter circuit (used for quick parameter practice or reference) */
  starterSchematic: CircuitSchematic;
  /** Verified solution circuit (blueprint for empty-board guided building & automated 50/50 SPICE tests) */
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
  challengeCompletedIds: number[];
  quizPassedIds: number[];
  currentLevelId: number;
  mode: AcademyMode;
  lastUpdated: string;
}
