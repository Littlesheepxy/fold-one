#!/usr/bin/env node
import { exportInputHabitsToRime } from "./export-rime.js";

const binPath = process.argv[2];
const report = exportInputHabitsToRime(binPath ? { sogouBinPath: binPath } : undefined);
console.log(JSON.stringify(report, null, 2));
