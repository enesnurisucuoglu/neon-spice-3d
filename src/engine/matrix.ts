/**
 * Zero-dependency numerical linear algebra for NeonSPICE.
 * Provides real and complex Gaussian elimination with partial pivoting.
 */

export interface Complex {
  re: number;
  im: number;
}

export function c(re: number, im = 0): Complex {
  return { re, im };
}

export function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/**
 * Numerically stable complex division using Smith's scaling formula
 * to prevent intermediate overflow/underflow.
 */
export function cDiv(a: Complex, b: Complex): Complex {
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    if (b.re === 0) return { re: NaN, im: NaN };
    const r = b.im / b.re;
    const denom = b.re + b.im * r;
    return {
      re: (a.re + a.im * r) / denom,
      im: (a.im - a.re * r) / denom,
    };
  } else {
    const r = b.re / b.im;
    const denom = b.im + b.re * r;
    return {
      re: (a.re * r + a.im) / denom,
      im: (a.im * r - a.re) / denom,
    };
  }
}

export function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

/**
 * Principal argument in degrees, wrapped to [-180, 180].
 */
export function cArgDeg(a: Complex): number {
  const deg = (Math.atan2(a.im, a.re) * 180) / Math.PI;
  if (deg > 180) return deg - 360;
  if (deg < -180) return deg + 360;
  return deg;
}

const SINGULAR_PIVOT_TOL = 1e-18;

/**
 * Solve the real linear system A * x = b using Gaussian elimination with
 * partial pivoting. Does not mutate caller inputs.
 * Returns null if the system is singular or produces non-finite values.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  if (A.length !== n) return null;

  // Deep-copy into working arrays
  const M: number[][] = new Array(n);
  const rhs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const row = A[i];
    if (!row || row.length !== n) return null;
    M[i] = row.slice();
    rhs[i] = b[i];
  }

  // Forward elimination with partial pivoting
  for (let k = 0; k < n; k++) {
    let pivotRow = k;
    let maxAbs = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(M[i][k]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = i;
      }
    }

    if (!Number.isFinite(maxAbs) || maxAbs < SINGULAR_PIVOT_TOL) {
      return null;
    }

    if (pivotRow !== k) {
      const tmpRow = M[k];
      M[k] = M[pivotRow];
      M[pivotRow] = tmpRow;

      const tmpB = rhs[k];
      rhs[k] = rhs[pivotRow];
      rhs[pivotRow] = tmpB;
    }

    const pivotRowArr = M[k];
    const pivot = pivotRowArr[k];
    const rhsK = rhs[k];

    for (let i = k + 1; i < n; i++) {
      const rowI = M[i];
      const factor = rowI[k] / pivot;
      if (factor === 0) continue;
      rowI[k] = 0;
      for (let j = k + 1; j < n; j++) {
        rowI[j] -= factor * pivotRowArr[j];
      }
      rhs[i] -= factor * rhsK;
    }
  }

  // Back substitution
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    const rowI = M[i];
    let sum = rhs[i];
    for (let j = i + 1; j < n; j++) {
      sum -= rowI[j] * x[j];
    }
    const diag = rowI[i];
    if (Math.abs(diag) < SINGULAR_PIVOT_TOL) return null;
    const val = sum / diag;
    if (!Number.isFinite(val)) return null;
    x[i] = val;
  }

  return x;
}

/**
 * Solve the complex linear system A * x = b using Gaussian elimination with
 * partial pivoting by complex magnitude. Does not mutate caller inputs.
 * Returns null if the system is singular or produces non-finite values.
 */
export function solveComplexLinearSystem(
  A: Complex[][],
  b: Complex[]
): Complex[] | null {
  const n = b.length;
  if (n === 0) return [];
  if (A.length !== n) return null;

  const M: Complex[][] = new Array(n);
  const rhs: Complex[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = A[i];
    if (!row || row.length !== n) return null;
    M[i] = row.map((v) => ({ re: v.re, im: v.im }));
    rhs[i] = { re: b[i].re, im: b[i].im };
  }

  // Forward elimination with partial pivoting by magnitude
  for (let k = 0; k < n; k++) {
    let pivotRow = k;
    let maxMag = cAbs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const mag = cAbs(M[i][k]);
      if (mag > maxMag) {
        maxMag = mag;
        pivotRow = i;
      }
    }

    if (!Number.isFinite(maxMag) || maxMag < SINGULAR_PIVOT_TOL) {
      return null;
    }

    if (pivotRow !== k) {
      const tmpRow = M[k];
      M[k] = M[pivotRow];
      M[pivotRow] = tmpRow;

      const tmpB = rhs[k];
      rhs[k] = rhs[pivotRow];
      rhs[pivotRow] = tmpB;
    }

    const pivotRowArr = M[k];
    const pivot = pivotRowArr[k];
    const rhsK = rhs[k];

    for (let i = k + 1; i < n; i++) {
      const rowI = M[i];
      if (rowI[k].re === 0 && rowI[k].im === 0) continue;
      const factor = cDiv(rowI[k], pivot);
      rowI[k] = { re: 0, im: 0 };
      for (let j = k + 1; j < n; j++) {
        const p = pivotRowArr[j];
        if (p.re === 0 && p.im === 0) continue;
        // rowI[j] -= factor * p
        rowI[j] = {
          re: rowI[j].re - (factor.re * p.re - factor.im * p.im),
          im: rowI[j].im - (factor.re * p.im + factor.im * p.re),
        };
      }
      rhs[i] = {
        re: rhs[i].re - (factor.re * rhsK.re - factor.im * rhsK.im),
        im: rhs[i].im - (factor.re * rhsK.im + factor.im * rhsK.re),
      };
    }
  }

  // Back substitution
  const x: Complex[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const rowI = M[i];
    let sumRe = rhs[i].re;
    let sumIm = rhs[i].im;
    for (let j = i + 1; j < n; j++) {
      const a = rowI[j];
      const xj = x[j];
      sumRe -= a.re * xj.re - a.im * xj.im;
      sumIm -= a.re * xj.im + a.im * xj.re;
    }
    const diag = rowI[i];
    if (cAbs(diag) < SINGULAR_PIVOT_TOL) return null;
    const val = cDiv({ re: sumRe, im: sumIm }, diag);
    if (!Number.isFinite(val.re) || !Number.isFinite(val.im)) return null;
    x[i] = val;
  }

  return x;
}
