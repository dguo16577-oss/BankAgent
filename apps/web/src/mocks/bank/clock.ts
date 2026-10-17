export const INITIAL_TIME = "2026-09-27T10:30:00+08:00";
// Deliberately independent of wall time; tests can advance/reset explicitly.
export class DemoClock {
  constructor(private instant = INITIAL_TIME) {}
  now() {
    return this.instant;
  }
  reset(instant = INITIAL_TIME) {
    this.instant = instant;
  }
  advance(milliseconds: number) {
    this.instant = new Date(
      Date.parse(this.instant) + milliseconds,
    ).toISOString();
    return this.instant;
  }
}
