import { GoogleGenAI } from "@google/genai";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { parseArgs } from "node:util";

const VALID_DURATIONS = ["4", "6", "8"];
const VALID_RESOLUTIONS = ["720p", "1080p"];

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string" },
      image: { type: "string" },
      output: { type: "string" },
      "aspect-ratio": { type: "string", default: "9:16" },
      duration: { type: "string", default: "8" },
      resolution: { type: "string", default: "720p" },
    },
    strict: true,
  });

  if (!values.prompt) {
    console.error("Error: --prompt is required");
    process.exit(1);
  }
  if (!values.image) {
    console.error("Error: --image is required (source image for image-to-video)");
    process.exit(1);
  }
  if (!values.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set");
    process.exit(1);
  }

  const aspectRatio = values["aspect-ratio"]!;
  const duration = values.duration!;
  const resolution = values.resolution!;

  if (!VALID_DURATIONS.includes(duration)) {
    console.error(`Error: Invalid duration: ${duration}. Choose from: ${VALID_DURATIONS.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_RESOLUTIONS.includes(resolution)) {
    console.error(`Error: Invalid resolution: ${resolution}. Choose from: ${VALID_RESOLUTIONS.join(", ")}`);
    process.exit(1);
  }
  if (resolution === "1080p" && duration !== "8") {
    console.error("Error: 1080p resolution requires duration of 8 seconds");
    process.exit(1);
  }

  // Read source image
  const imagePath = resolve(values.image);
  const ext = extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    console.error(`Error: Unsupported image format: ${ext}`);
    process.exit(1);
  }
  const imageData = await readFile(imagePath);

  const ai = new GoogleGenAI({ apiKey });

  console.error(`Source image: ${imagePath}`);
  console.error(`Generating video (${duration}s, ${resolution}, ${aspectRatio})...`);

  // Start video generation (with rate limit retry)
  const MAX_RETRIES = 5;
  const RETRY_BASE_SECONDS = 60;
  let operation;
  for (let attempt = 0; ; attempt++) {
    try {
      operation = await ai.models.generateVideos({
        model: "veo-3.1-lite-generate-preview",
        prompt: values.prompt,
        image: {
          imageBytes: imageData.toString("base64"),
          mimeType,
        },
        config: {
          aspectRatio,
          durationSeconds: parseInt(duration),
          resolution,
          personGeneration: "allow_adult",
        },
      });
      break;
    } catch (err: any) {
      const status = err?.status ?? err?.httpStatusCode ?? err?.code;
      if (status === 429 && attempt < MAX_RETRIES) {
        const wait = RETRY_BASE_SECONDS * (attempt + 1);
        console.error(`Rate limited (429). Retrying in ${wait}s... (${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }

  // Poll until done
  const startTime = Date.now();
  while (!operation.done) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`Waiting... (${elapsed}s elapsed)`);
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({
      operation,
    });
  }

  const generatedVideos = (operation as any).response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    console.error("Error: No video in response");
    process.exit(1);
  }

  const video = generatedVideos[0].video;

  const outputPath = resolve(values.output);
  await mkdir(dirname(outputPath), { recursive: true });

  // Download video
  if (video.imageBytes) {
    // Direct bytes in response
    const bytes = typeof video.imageBytes === "string"
      ? Buffer.from(video.imageBytes, "base64")
      : Buffer.from(video.imageBytes);
    await writeFile(outputPath, bytes);
  } else {
    // Use SDK download
    await ai.files.download({
      file: video,
      downloadPath: outputPath,
    });
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(outputPath);
  console.error(`Done! (${elapsed}s total)`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
