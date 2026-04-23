import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, extname, basename } from "node:path";
import { parseArgs } from "node:util";

const VALID_DURATIONS = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
const VALID_RESOLUTIONS = ["480p", "720p"];
const VALID_ASPECT_RATIOS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

async function main() {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string" },
      image: { type: "string" },
      output: { type: "string" },
      "aspect-ratio": { type: "string", default: "9:16" },
      duration: { type: "string", default: "4" },
      resolution: { type: "string", default: "720p" },
      "generate-audio": { type: "boolean", default: false },
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

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.error("Error: FAL_KEY environment variable is not set");
    process.exit(1);
  }

  const aspectRatio = values["aspect-ratio"]!;
  const duration = values.duration!;
  const resolution = values.resolution!;
  const generateAudio = values["generate-audio"]!;

  if (!VALID_DURATIONS.includes(duration)) {
    console.error(`Error: Invalid duration: ${duration}. Choose from: ${VALID_DURATIONS.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_RESOLUTIONS.includes(resolution)) {
    console.error(`Error: Invalid resolution: ${resolution}. Choose from: ${VALID_RESOLUTIONS.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    console.error(`Error: Invalid aspect-ratio: ${aspectRatio}. Choose from: ${VALID_ASPECT_RATIOS.join(", ")}`);
    process.exit(1);
  }

  fal.config({ credentials: apiKey });

  const imagePath = resolve(values.image);
  const ext = extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    console.error(`Error: Unsupported image format: ${ext}`);
    process.exit(1);
  }
  const imageData = await readFile(imagePath);

  console.error(`Source image: ${imagePath}`);
  console.error(`Uploading image to fal storage...`);

  const file = new File([new Uint8Array(imageData)], basename(imagePath), { type: mimeType });
  const imageUrl = await fal.storage.upload(file);
  console.error(`Uploaded: ${imageUrl}`);

  console.error(`Generating video (${duration}s, ${resolution}, ${aspectRatio}, audio=${generateAudio})...`);

  const startTime = Date.now();
  const result = await fal.subscribe("bytedance/seedance-2.0/fast/image-to-video", {
    input: {
      prompt: values.prompt,
      image_url: imageUrl,
      resolution,
      duration: parseInt(duration),
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stderr.write(`\rGenerating... (${elapsed}s)`);
      }
    },
  });

  process.stderr.write("\n");

  const videoUrl = (result.data as any)?.video?.url;
  if (!videoUrl) {
    console.error("Error: No video URL in response");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.error(`Downloading from: ${videoUrl}`);
  const response = await fetch(videoUrl);
  if (!response.ok) {
    console.error(`Error: Failed to download video: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  const videoBuffer = Buffer.from(await response.arrayBuffer());

  const outputPath = resolve(values.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, videoBuffer);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(outputPath);
  console.error(`Done! (${elapsed}s total)`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  const anyErr = err as any;
  if (anyErr?.status) console.error(`Status: ${anyErr.status}`);
  if (anyErr?.body) console.error(`Body: ${JSON.stringify(anyErr.body, null, 2)}`);
  if (anyErr?.validation_errors) console.error(`Validation: ${JSON.stringify(anyErr.validation_errors, null, 2)}`);
  process.exit(1);
});
