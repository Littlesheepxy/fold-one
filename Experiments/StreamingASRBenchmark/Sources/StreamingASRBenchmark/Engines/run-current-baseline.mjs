import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const wavPath = process.argv[2];
if (!wavPath) {
  console.error("Usage: node run-current-baseline.mjs <wav>");
  process.exit(2);
}

const require = createRequire(import.meta.url);

function parseWavPcm16(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Only RIFF WAVE files are supported");
  }
  let offset = 12;
  let fmt;
  let data;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") fmt = { start, size };
    if (id === "data") data = { start, size };
    offset = start + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("Invalid WAV: missing fmt or data chunk");
  const audioFormat = buf.readUInt16LE(fmt.start);
  const channels = buf.readUInt16LE(fmt.start + 2);
  const bitsPerSample = buf.readUInt16LE(fmt.start + 14);
  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16) {
    throw new Error("Baseline runner expects mono PCM16 WAV");
  }
  const count = data.size / 2;
  const pcmf32 = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pcmf32[i] = buf.readInt16LE(data.start + i * 2) / 32768;
  }
  return pcmf32;
}

const model = process.env.FOLD_LOCAL_WHISPER_MODEL_PATH;
if (!model) throw new Error("FOLD_LOCAL_WHISPER_MODEL_PATH is required");

const addonPackage = require.resolve("@kutalia/whisper-node-addon/package.json", {
  paths: [process.cwd()],
});
const packageDir = addonPackage.replace(/\/package\.json$/, "");
const platform = process.platform === "darwin" ? "mac" : process.platform;
const addon = require(`${packageDir}/dist/${platform}-${process.arch}/whisper.node`);
const pcmf32 = parseWavPcm16(wavPath);

addon.whisper(
  {
    model,
    pcmf32,
    language: "zh",
    use_gpu: true,
    translate: false,
    no_timestamps: true,
    no_prints: true,
  },
  (error, result) => {
    if (error) throw error;
    const text = Array.isArray(result?.transcription)
      ? result.transcription.map((segment) => Array.isArray(segment) ? String(segment[2] ?? segment.at(-1) ?? "") : String(segment)).join(" ")
      : "";
    process.stdout.write(text.replace(/\s+/g, " ").trim());
  },
);
