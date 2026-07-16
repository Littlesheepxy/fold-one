#!/usr/bin/env node
import { importInputHabitsOneClick } from "./import.js";

const report = importInputHabitsOneClick();
console.log(JSON.stringify({ entryCount: report.entryCount, bySource: report.bySource, notes: report.notes, sample: report.sample.slice(0, 15) }, null, 2));
