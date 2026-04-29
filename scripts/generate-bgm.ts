import { fal } from "@fal-ai/client";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const VALID_FORMATS = ["mp3", "wav", "pcm"];
const VALID_SAMPLE_RATES = [16000, 24000, 32000, 44100];
const VALID_BITRATES = [32000, 64000, 128000, 256000];

async function main() {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string" },
      lyrics: { type: "string" },
      output: { type: "string" },
      instrumental: { type: "boolean", default: false },
      "lyrics-optimizer": { type: "boolean", default: false },
      format: { type: "string", default: "mp3" },
      "sample-rate": { type: "string", default: "44100" },
      bitrate: { type: "string", default: "256000" },
    },
    strict: true,
  });

  if (!values.prompt) {
    console.error("Error: --prompt is required");
    process.exit(1);
  }
  if (!values.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.error("Error: FAL_KEY environment variable is not set");
    process.exit(1);
  }

  const format = values.format!;
  const sampleRate = parseInt(values["sample-rate"]!);
  const bitrate = parseInt(values.bitrate!);
  const instrumental = values.instrumental!;
  const lyricsOptimizer = values["lyrics-optimizer"]!;

  if (!VALID_FORMATS.includes(format)) {
    console.error(`Error: Invalid format: ${format}. Choose from: ${VALID_FORMATS.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_SAMPLE_RATES.includes(sampleRate)) {
    console.error(`Error: Invalid sample-rate: ${sampleRate}. Choose from: ${VALID_SAMPLE_RATES.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_BITRATES.includes(bitrate)) {
    console.error(`Error: Invalid bitrate: ${bitrate}. Choose from: ${VALID_BITRATES.join(", ")}`);
    process.exit(1);
  }
  if (!instrumental && !values.lyrics && !lyricsOptimizer) {
    console.error("Error: When --instrumental is false, either --lyrics or --lyrics-optimizer is required");
    process.exit(1);
  }

  fal.config({ credentials: apiKey });

  const input: Record<string, unknown> = {
    prompt: values.prompt,
    is_instrumental: instrumental,
    audio_setting: {
      format,
      sample_rate: sampleRate,
      bitrate,
    },
  };

  if (values.lyrics) input.lyrics = values.lyrics;
  if (lyricsOptimizer) input.lyrics_optimizer = true;

  console.error(`Generating BGM (instrumental=${instrumental}, format=${format}, ${sampleRate}Hz, ${bitrate}bps)...`);

  const startTime = Date.now();
  const result = await fal.subscribe("fal-ai/minimax-music/v2.5", {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stderr.write(`\rGenerating... (${elapsed}s)`);
      }
    },
  });

  process.stderr.write("\n");

  const audioUrl = (result.data as any)?.audio?.url;
  if (!audioUrl) {
    console.error("Error: No audio URL in response");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.error(`Downloading from: ${audioUrl}`);
  const response = await fetch(audioUrl);
  if (!response.ok) {
    console.error(`Error: Failed to download audio: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const outputPath = resolve(values.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, audioBuffer);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(outputPath);
  console.error(`Done! (${elapsed}s total)`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  const anyErr = err as any;
  if (anyErr?.status) console.error(`Status: ${anyErr.status}`);
  if (anyErr?.body) console.error(`Body: ${JSON.stringify(anyErr.body, null, 2)}`);
  process.exit(1);
});
