// Shared data for the two Gantt directions. The first project is the real 26-051 test card as it stands in the
// database today (28 Oct 2026); the other two are sample projects so the page shows a realistic load.
window.TODAY = "2026-10-28";
window.OWNER = { JOINERY: "GAJU", PAINT: "GAJU", DELIVERY: "GAJU", INSTALL: "PM", STONE: "PM", SNAGGING: "PM" };
window.STAGES = ["JOINERY", "PAINT", "DELIVERY", "INSTALL", "STONE", "SNAGGING"];
window.STAGE_LABEL = { JOINERY: "Joinery", PAINT: "Paint", DELIVERY: "Delivery", INSTALL: "Install", STONE: "Stone", SNAGGING: "Snagging" };
window.PROJECTS = [
  { enq: "26-051", name: "Test only, delete me", client: "N/A", pm: "BASIM", items: [
    { code: "26-051-K02", name: "Main kitchen", area: "Ground floor", stages: [
      { s: "JOINERY", ps: "2026-09-29", pe: "2026-10-10", as: "2026-09-29", ae: "2026-10-09", st: "COMPLETE" },
      { s: "PAINT", ps: "2026-10-11", pe: "2026-10-18", as: "2026-10-12", st: "IN_PROGRESS", pct: 70 },
      { s: "DELIVERY", ps: "2026-10-20", pe: "2026-10-22", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-10-23", pe: "2026-10-29", st: "NOT_STARTED" },
      { s: "STONE", ps: "2026-10-30", pe: "2026-11-03", st: "NOT_STARTED" },
      { s: "SNAGGING", ps: "2026-11-04", pe: "2026-11-06", st: "NOT_STARTED" } ] },
    { code: "26-051-K01", name: "Pantry", area: "Ground floor", stages: [
      { s: "JOINERY", ps: "2026-10-06", pe: "2026-10-16", as: "2026-10-07", st: "DELAYED", pct: 60 },
      { s: "PAINT", ps: "2026-10-17", pe: "2026-10-22", st: "NOT_STARTED" },
      { s: "DELIVERY", ps: "2026-10-24", pe: "2026-10-26", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-10-27", pe: "2026-10-31", st: "NOT_STARTED" },
      { s: "STONE", na: true },
      { s: "SNAGGING", ps: "2026-11-02", pe: "2026-11-04", st: "NOT_STARTED" } ] },
  ] },
  { enq: "26-011", name: "Meadows 5, Street 3, Villa 43", client: "Mr Al Hashimi", pm: "BASIM", sample: true, items: [
    { code: "26-011-K01", name: "Kitchen", area: "Ground floor", stages: [
      { s: "JOINERY", ps: "2026-10-01", pe: "2026-10-14", as: "2026-10-01", ae: "2026-10-15", st: "COMPLETE" },
      { s: "PAINT", ps: "2026-10-15", pe: "2026-10-22", as: "2026-10-16", ae: "2026-10-24", st: "COMPLETE" },
      { s: "DELIVERY", ps: "2026-10-26", pe: "2026-10-27", as: "2026-10-27", st: "IN_PROGRESS", pct: 50 },
      { s: "INSTALL", ps: "2026-10-28", pe: "2026-11-05", st: "NOT_STARTED" },
      { s: "STONE", ps: "2026-11-08", pe: "2026-11-12", st: "NOT_STARTED" },
      { s: "SNAGGING", ps: "2026-11-15", pe: "2026-11-17", st: "NOT_STARTED" } ] },
    { code: "26-011-W01", name: "Master walk-in", area: "First floor", stages: [
      { s: "JOINERY", ps: "2026-10-08", pe: "2026-10-20", as: "2026-10-09", st: "IN_PROGRESS", pct: 85 },
      { s: "PAINT", ps: "2026-10-21", pe: "2026-10-27", st: "NOT_STARTED" },
      { s: "DELIVERY", ps: "2026-10-29", pe: "2026-10-30", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-11-01", pe: "2026-11-05", st: "NOT_STARTED" },
      { s: "STONE", na: true },
      { s: "SNAGGING", ps: "2026-11-15", pe: "2026-11-17", st: "NOT_STARTED" } ] },
    { code: "26-011-W02", name: "Guest wardrobes ×3", area: "First floor", stages: [
      { s: "JOINERY", ps: "2026-10-20", pe: "2026-11-02", st: "ON_HOLD", note: "Veneer on back-order" },
      { s: "PAINT", ps: "2026-11-03", pe: "2026-11-08", st: "NOT_STARTED" },
      { s: "DELIVERY", ps: "2026-11-10", pe: "2026-11-11", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-11-12", pe: "2026-11-16", st: "NOT_STARTED" },
      { s: "STONE", na: true },
      { s: "SNAGGING", ps: "2026-11-17", pe: "2026-11-18", st: "NOT_STARTED" } ] },
    { code: "26-011-V01", name: "Master vanity", area: "First floor", stages: [
      { s: "JOINERY", ps: "2026-10-22", pe: "2026-10-30", as: "2026-10-23", st: "IN_PROGRESS", pct: 30 },
      { s: "PAINT", ps: "2026-11-01", pe: "2026-11-04", st: "NOT_STARTED" },
      { s: "DELIVERY", ps: "2026-11-10", pe: "2026-11-11", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-11-12", pe: "2026-11-14", st: "NOT_STARTED" },
      { s: "STONE", ps: "2026-11-15", pe: "2026-11-18", st: "NOT_STARTED" },
      { s: "SNAGGING", ps: "2026-11-19", pe: "2026-11-20", st: "NOT_STARTED" } ] },
  ] },
  { enq: "26-032", name: "Sobha Reserve V622", client: "Mrs Khan", pm: "DIPAK", sample: true, items: [
    { code: "26-032-K01", name: "Show kitchen", area: "Ground floor", stages: [
      { s: "JOINERY", ps: "2026-09-15", pe: "2026-09-30", as: "2026-09-15", ae: "2026-10-02", st: "COMPLETE" },
      { s: "PAINT", ps: "2026-10-03", pe: "2026-10-10", as: "2026-10-03", ae: "2026-10-12", st: "COMPLETE" },
      { s: "DELIVERY", ps: "2026-10-13", pe: "2026-10-14", as: "2026-10-14", ae: "2026-10-14", st: "COMPLETE" },
      { s: "INSTALL", ps: "2026-10-15", pe: "2026-10-24", as: "2026-10-16", st: "DELAYED", pct: 80, note: "Waiting on site power" },
      { s: "STONE", ps: "2026-10-26", pe: "2026-10-30", st: "NOT_STARTED" },
      { s: "SNAGGING", ps: "2026-11-02", pe: "2026-11-04", st: "NOT_STARTED" } ] },
    { code: "26-032-K02", name: "Wet kitchen", area: "Ground floor", stages: [
      { s: "JOINERY", ps: "2026-09-22", pe: "2026-10-06", as: "2026-09-22", ae: "2026-10-06", st: "COMPLETE" },
      { s: "PAINT", ps: "2026-10-07", pe: "2026-10-12", as: "2026-10-08", ae: "2026-10-12", st: "COMPLETE" },
      { s: "DELIVERY", ps: "2026-10-13", pe: "2026-10-14", as: "2026-10-14", ae: "2026-10-14", st: "COMPLETE" },
      { s: "INSTALL", ps: "2026-10-15", pe: "2026-10-21", as: "2026-10-16", ae: "2026-10-22", st: "COMPLETE" },
      { s: "STONE", ps: "2026-10-26", pe: "2026-10-28", as: "2026-10-27", st: "IN_PROGRESS", pct: 40 },
      { s: "SNAGGING", ps: "2026-10-29", pe: "2026-10-30", st: "NOT_STARTED" } ] },
    { code: "26-032-T01", name: "Majlis TV wall", area: "Ground floor", stages: [
      { s: "JOINERY", ps: "2026-10-13", pe: "2026-10-24", as: "2026-10-13", ae: "2026-10-23", st: "COMPLETE" },
      { s: "PAINT", ps: "2026-10-25", pe: "2026-10-29", as: "2026-10-26", st: "IN_PROGRESS", pct: 55 },
      { s: "DELIVERY", ps: "2026-11-01", pe: "2026-11-01", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-11-02", pe: "2026-11-05", st: "NOT_STARTED" },
      { s: "STONE", na: true },
      { s: "SNAGGING", ps: "2026-11-08", pe: "2026-11-09", st: "NOT_STARTED" } ] },
    { code: "26-032-W01", name: "Dressing room", area: "First floor", stages: [
      { s: "JOINERY", ps: "2026-10-27", pe: "2026-11-09", st: "NOT_STARTED" },
      { s: "PAINT", ps: "2026-11-10", pe: "2026-11-15", st: "NOT_STARTED" },
      { s: "DELIVERY", ps: "2026-11-17", pe: "2026-11-17", st: "NOT_STARTED" },
      { s: "INSTALL", ps: "2026-11-18", pe: "2026-11-23", st: "NOT_STARTED" },
      { s: "STONE", na: true },
      { s: "SNAGGING", ps: "2026-11-24", pe: "2026-11-25", st: "NOT_STARTED" } ] },
  ] },
];
