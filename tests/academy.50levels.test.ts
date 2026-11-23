import { describe, expect, it } from 'vitest';
import { ACADEMY_CHAPTERS, ACADEMY_LEVELS } from '../src/data/academyLevels';
import { COMPONENT_GUIDE } from '../src/data/componentGuide';
import { compileNetlist, runSimulation, solveDCOP } from '../src/engine';
import { COMPONENT_PINS, ComponentType } from '../src/types/circuit';

describe('NeonSPICE 3D Academy — 50-Level SPICE Verification & 25-Component Guide Suite', () => {
  describe('Academy Curriculum Structure', () => {
    it('contains exactly 50 levels with strictly sequential IDs 1..50', () => {
      expect(ACADEMY_LEVELS).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(ACADEMY_LEVELS[i].id).toBe(i + 1);
      }
    });

    it('organizes chapters 1..10 with exactly 5 levels per chapter', () => {
      expect(ACADEMY_CHAPTERS).toHaveLength(10);
      for (let ch = 1; ch <= 10; ch++) {
        const chapterLevels = ACADEMY_LEVELS.filter((lvl) => lvl.chapter === ch);
        expect(chapterLevels, `Chapter ${ch} should have 5 levels`).toHaveLength(5);
        expect(chapterLevels[0].id).toBe((ch - 1) * 5 + 1);
        expect(chapterLevels[4].id).toBe(ch * 5);
      }
    });

    it('provides non-empty Turkish pedagogy fields for every level', () => {
      for (const level of ACADEMY_LEVELS) {
        expect(level.title.trim().length, `Level ${level.id} title`).toBeGreaterThan(0);
        expect(level.concept.trim().length, `Level ${level.id} concept`).toBeGreaterThan(0);
        expect(level.steps.length, `Level ${level.id} steps`).toBeGreaterThan(0);
        expect(level.goalText.trim().length, `Level ${level.id} goalText`).toBeGreaterThan(0);
        expect(level.hint.trim().length, `Level ${level.id} hint`).toBeGreaterThan(0);
        expect(
          level.realWorldNote.trim().length,
          `Level ${level.id} realWorldNote`
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('Component Guide Completeness (All 25 ComponentTypes)', () => {
    const allComponentTypes = Object.keys(COMPONENT_PINS) as ComponentType[];

    it('covers all 25 ComponentType entries in COMPONENT_GUIDE', () => {
      expect(allComponentTypes).toHaveLength(25);
      expect(Object.keys(COMPONENT_GUIDE)).toHaveLength(25);
    });

    for (const compType of allComponentTypes) {
      it(`has a complete non-empty Turkish guide entry for "${compType}"`, () => {
        const entry = COMPONENT_GUIDE[compType];
        expect(entry, `Missing COMPONENT_GUIDE entry for ${compType}`).toBeDefined();
        expect(entry.title.trim().length).toBeGreaterThan(0);
        expect(entry.shortDesc.trim().length).toBeGreaterThan(0);
        expect(entry.analogy.trim().length).toBeGreaterThan(0);
        expect(entry.pins.trim().length).toBeGreaterThan(0);
        expect(entry.practicalTip.trim().length).toBeGreaterThan(0);
        expect(entry.typicalValues.trim().length).toBeGreaterThan(0);
      });
    }
  });

  describe('All 50 Academy Levels — Starter Fails & Solution Passes Real SPICE Physics', () => {
    for (const level of ACADEMY_LEVELS) {
      it(`Level ${level.id} (Ch ${level.chapter}): "${level.title}" — clean netlists, starter fails, solution passes`, () => {
        // 1. Compile starter & solution netlists with 0 warnings
        const starterCompiled = compileNetlist(level.starterSchematic);
        expect(
          starterCompiled.warnings,
          `Level ${level.id} starter netlist warnings: ${starterCompiled.warnings.join('; ')}`
        ).toHaveLength(0);

        const solutionCompiled = compileNetlist(level.solutionSchematic);
        expect(
          solutionCompiled.warnings,
          `Level ${level.id} solution netlist warnings: ${solutionCompiled.warnings.join('; ')}`
        ).toHaveLength(0);

        // 2. Starter schematic MUST NOT already pass (genuine engineering challenge)
        const starterDc = solveDCOP(level.starterSchematic, starterCompiled);
        const starterSim = runSimulation(
          level.starterSchematic,
          level.verificationAnalysis
        );
        const starterCheck = level.verify(
          starterDc,
          starterSim,
          level.starterSchematic
        );
        expect(
          starterCheck.passed,
          `Level ${level.id} starter unexpectedly passed: ${starterCheck.summary}`
        ).toBe(false);

        // 3. Solution schematic MUST pass its exact SPICE physics verification
        const solutionDc = solveDCOP(level.solutionSchematic, solutionCompiled);
        const solutionSim = runSimulation(
          level.solutionSchematic,
          level.verificationAnalysis
        );
        const solutionCheck = level.verify(
          solutionDc,
          solutionSim,
          level.solutionSchematic
        );
        expect(
          solutionCheck.passed,
          `Level ${level.id} solution failed: ${solutionCheck.summary} | details=${JSON.stringify(solutionCheck.details)}`
        ).toBe(true);
      });
    }
  });
});
