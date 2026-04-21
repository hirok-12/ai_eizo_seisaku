# AI映像制作

AIを活用したCM映像制作ワークフロー。コンセプト設計から動画編集まで、Claudeのエージェントが各工程を担当する。

## ワークフロー

| # | 工程 | エージェント | 成果物 |
|---|------|-------------|--------|
| 1 | コンセプト設計 | `concept-design` | `concept.md` |
| 2 | 絵コンテ作成 | `storyboard` | `storyboard.md` |
| 3 | 素材生成（静止画） | `asset-generation` | `prompts.md` + `images/` |
| 4 | 動画生成 | `video-generation` | `video-prompts.md` + `videos/` |
| 5 | 編集・仕上げ | `video-editing` | `editing.md` + `edit.sh` |

## セットアップ

```bash
npm install
```

### 環境変数

`.env` ファイルをプロジェクトルートに作成:

```
GEMINI_API_KEY=your_api_key_here
```

Gemini API キーは [Google AI Studio](https://aistudio.google.com/apikey) から取得できる。

## 使用API・料金

### 画像生成: Gemini Nano Banana 2

- モデル: `gemini-3.1-flash-image-preview`
- 無料枠: なし（有料のみ）

| 解像度 | 1枚あたりの料金 |
|--------|----------------|
| 512px (0.5K) | $0.045 |
| 1024px (1K) | $0.067 |
| 2048px (2K) | $0.101 |
| 4096px (4K) | $0.151 |

バッチ処理利用時は50%割引が適用される。

```bash
npx tsx --env-file .env scripts/generate-image.ts \
  --prompt "プロンプト" \
  --output output.png \
  --aspect-ratio 9:16 \
  --size 1K \
  --reference reference.png
```

### 動画生成: Veo 3.1 Lite

- モデル: `veo-3.1-lite-generate-preview`
- 無料枠: なし（有料のみ）
- 生成時間: 1クリップあたり約1〜6分

| 解像度 | 1秒あたりの料金 | 4秒クリップ | 8秒クリップ |
|--------|----------------|------------|------------|
| 720p | $0.05 | $0.20 | $0.40 |
| 1080p | $0.08 | - | $0.64 |

※ 1080pは8秒固定。4K は非対応。

```bash
npx tsx --env-file .env scripts/generate-video.ts \
  --prompt "モーション指示" \
  --image input.png \
  --output output.mp4 \
  --aspect-ratio 9:16 \
  --duration 8 \
  --resolution 720p
```

### CM1本あたりの参考コスト

10カットのCMを制作する場合の目安:

| 工程 | 計算 | コスト |
|------|------|--------|
| 画像生成 (1K) | 10枚 x $0.067 | $0.67 |
| 動画生成 (720p, 8秒) | 10本 x $0.40 | $4.00 |
| リテイク (想定2〜3回) | - | $1〜2 |
| **合計** | | **約 $5〜7** |

## プロジェクト構造

成果物は全て `output/` 配下に格納される（`.gitignore` で除外）。

```
output/
└── {番号}.{プロジェクト名}/
    ├── concept.md        # コンセプトシート
    ├── storyboard.md     # ストーリーボード
    ├── prompts.md        # 画像生成プロンプト
    ├── video-prompts.md  # 動画生成プロンプト
    ├── editing.md        # 編集指示書
    ├── edit.sh           # ffmpegスクリプト
    ├── images/
    │   └── scene_{N}/    # カットごとの静止画
    └── videos/
        └── scene_{N}/    # カットごとの動画
```
