#!/usr/bin/env node
import { listInstalledInputMethods } from "./index.js";

const list = listInstalledInputMethods();
console.log(JSON.stringify(list, null, 2));
