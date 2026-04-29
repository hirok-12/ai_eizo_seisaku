import OpenAI from "openai";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const VALID_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
];
const VALID_FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"];
const VALID_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];

async function main() {
  const { values } = parseArgs({
    options: {
      text: { type: "string" },
      output: { type: "string" },
      voice: { type: "string", default: "shimmer" },
      model: { type: "string", default: "gpt-4o-mini-tts" },
      format: { type: "string", default: "mp3" },
      instructions: { type: "string" },
      speed: { type: "string", default: "1.0" },
    },
    strict: true,
  });

  if (!values.text) {
    console.error("Error: --text is required");
    process.exit(1);
  }
  if (!values.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY environment variable is not set");
    process.exit(1);
  }

  const voice = values.voice!;
  const model = values.model!;
  const format = values.format!;
  const speed = parseFloat(values.speed!);

  if (!VALID_VOICES.includes(voice)) {
    console.error(`Error: Invalid voice: ${voice}. Choose from: ${VALID_VOICES.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_MODELS.includes(model)) {
    console.error(`Error: Invalid model: ${model}. Choose from: ${VALID_MODELS.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_FORMATS.includes(format)) {
    console.error(`Error: Invalid format: ${format}. Choose from: ${VALID_FORMATS.join(", ")}`);
    process.exit(1);
  }
  if (Number.isNaN(speed) || speed < 0.25 || speed > 4.0) {
    console.error(`Error: Invalid speed: ${values.speed}. Must be between 0.25 and 4.0`);
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  console.error(`Generating narration (model=${model}, voice=${voice}, format=${format}, speed=${speed})...`);

  const startTime = Date.now();

  const requestParams: Record<string, unknown> = {
    model,
    voice,
    input: values.text,
    response_format: format,
    speed,
  };

  if (values.instructions && model === "gpt-4o-mini-tts") {
    requestParams.instructions = values.instructions;
  }

  const response = await openai.audio.speech.create(requestParams as any);

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const outputPath = resolve(values.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, audioBuffer);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(outputPath);
  console.error(`Done! (${elapsed}s, ${audioBuffer.length} bytes)`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  const anyErr = err as any;
  if (anyErr?.status) console.error(`Status: ${anyErr.status}`);
  if (anyErr?.error) console.error(`Detail: ${JSON.stringify(anyErr.error)}`);
  process.exit(1);
});
