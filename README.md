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

### 実行モデル: 親オーケストレータ + サブエージェント

各エージェントは **ユーザーと直接対話しない**（`AskUserQuestion` が subagent context で使えないため）。**メインの会話（親オーケストレータ）が窓口** となり、ヒアリング結果を構造化してサブエージェントに渡し、サブエージェントは受け取った情報からファイル生成に専念する分業体制。

- **親（メイン会話）**: 尺・ターゲット・トンマナ等のヒアリング、各工程の成果物レビュー、ユーザー確認
- **子（サブエージェント）**: 親から受け取った情報と既存成果物を読み取り、`concept.md` / `storyboard.md` / `prompts.md` / 画像 / 動画 / `editing.md` 等を生成

### クリエイティブ共通ルール

本リポジトリのワークフローでは、以下のルールが全プロジェクトに適用される（`CLAUDE.md` および各 `.claude/agents/*.md` に明記）:

- **人物描写は全員日本人**（コンセプト段階で例外指定がない限り）。プロンプトに `Japanese` / `authentic Japanese person` を必須で含める
- **エンドカードは2層構造（情緒コピー + 商品識別情報）必須**。`asset-generation` の画像生成段階で「上層: 情緒コピー / 中層: パッケージ・ロゴ / 下層: 商品名（日本語+英語）」を一体生成。情緒コピー単独・パッケージ単独のエンドは廃案にする
- **音響設計はコンセプト段階で必ず定義**。BGM方向性・SE一覧・ナレーション要否を `concept.md` に明記し、`video-editing` でBGM/SE/ナレーションを統合した完成版マスター（無音マスターは廃止）を `-14 LUFS` に正規化して書き出す

## セットアップ

```bash
npm install
```

### 環境変数

`.env` ファイルをプロジェクトルートに作成:

```
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
FAL_KEY=your_fal_api_key_here
```

- OpenAI API キーは [OpenAI Platform](https://platform.openai.com/api-keys) から取得（画像生成 + ナレーション TTS 用）
- Gemini API キーは [Google AI Studio](https://aistudio.google.com/apikey) から取得（Veo 動画生成用）
- fal.ai API キーは [fal.ai dashboard](https://fal.ai) から取得（BGM 生成用）

## 使用API・料金

### 画像生成: GPT Image 2

- モデル: `gpt-image-2`

| 品質 | サイズ | 1枚あたりの料金 |
|------|--------|----------------|
| low | 1024x1024 | $0.011 |
| low | 1024x1536 / 1536x1024 | $0.016 |
| medium | 1024x1024 | $0.035 |
| medium | 1024x1536 / 1536x1024 | $0.053 |
| high | 1024x1024 | $0.067 |
| high | 1024x1536 / 1536x1024 | $0.100 |

```bash
npx tsx --env-file .env scripts/generate-image.ts \
  --prompt "プロンプト" \
  --output output.png \
  --size 1024x1536 \
  --quality medium \
  --reference reference.png
```

### 動画生成: Veo 3.1 Lite

- モデル: `veo-3.1-lite-generate-preview`
- 無料枠: なし（有料のみ）
- 生成時間: 1クリップあたり約1〜6分

| 解像度 | 1秒あたりの料金 | 4秒クリップ | 6秒クリップ | 8秒クリップ |
|--------|----------------|------------|------------|------------|
| 720p | $0.05 | $0.20 | $0.30 | $0.40 |
| 1080p | $0.08 | - | - | $0.64 |

※ 1080pは8秒固定。720pは4/6/8秒から選択可。4K は非対応。

```bash
npx tsx --env-file .env scripts/generate-video.ts \
  --prompt "モーション指示" \
  --image input.png \
  --output output.mp4 \
  --aspect-ratio 9:16 \
  --duration 8 \
  --resolution 720p
```

### BGM生成: MiniMax Music 2.5（fal.ai 経由）

- モデル: `fal-ai/minimax-music/v2.5`
- 料金: **$0.035/生成**（曲長に関係なく1回課金、最大3分前後）
- インスト専用モード対応（`--instrumental`）、商用利用OK
- 日本語のプロンプト・歌詞も入力可能

```bash
npx tsx --env-file .env scripts/generate-bgm.ts \
  --prompt "Quiet emotional piano ballad, late night atmosphere, slow tempo around 60 BPM, cinematic film score" \
  --instrumental \
  --output output/{project}/bgm.mp3 \
  --format mp3 \
  --sample-rate 44100 \
  --bitrate 256000
```

ボーカル入りの場合は `--lyrics` で歌詞を渡す（構造タグ `[Intro]` `[Verse]` `[Chorus]` `[Outro]` 等で展開を制御）。

### ナレーション生成: OpenAI TTS（gpt-4o-mini-tts）

- モデル: `gpt-4o-mini-tts`（13ボイス、日本語対応）
- 料金: **約$0.015/分**（テキスト$0.60/Mトークン + 音声$12/Mトークン）
- voice: `alloy` / `ash` / `ballad` / `coral` / `echo` / `fable` / `nova` / `onyx` / `sage` / `shimmer` / `verse` / `marin` / `cedar`
- `--instructions` で読み上げトーンを自然言語で指示可能

```bash
npx tsx --env-file .env scripts/generate-narration.ts \
  --text "応援してるよ" \
  --output output/{project}/audio/narration_C6.mp3 \
  --voice shimmer \
  --instructions "Speak in a warm, gentle, motherly Japanese voice, soft and caring like whispering encouragement"
```

### CM1本あたりの参考コスト

20秒・6カット・BGMありCM（cupnoodle 実績ベース）の目安:

| 工程 | 計算 | コスト |
|------|------|--------|
| 画像生成 (high, 1024x1536) | 6枚 x $0.100 + リテイク | $0.7〜1.1 |
| 動画生成 (720p, 4秒) | 6本 x $0.20 | $1.20 |
| BGM生成 (MiniMax Music 2.5) | 1〜2本 x $0.035 | $0.04〜0.07 |
| ナレーション生成 (TTS、ある時のみ) | 30秒 x $0.015 | $0.01 |
| **合計** | | **約 $2〜3** |

10カット・8秒構成にするとさらに増えるが、いずれにせよ **CM1本$5以下** に収まる。

## プロジェクト構造

成果物は全て `output/` 配下に格納される（`.gitignore` で除外）。

```
output/
└── {番号}.{プロジェクト名}/
    ├── concept.md        # コンセプトシート（音響設計・エンドカード設計含む）
    ├── storyboard.md     # ストーリーボード
    ├── prompts.md        # 画像生成プロンプト
    ├── video-prompts.md  # 動画生成プロンプト
    ├── editing.md        # 編集指示書
    ├── edit.sh           # ffmpegスクリプト
    ├── images/
    │   └── scene_{N}/    # カットごとの静止画
    ├── videos/
    │   └── scene_{N}/    # カットごとの動画
    ├── audio/
    │   ├── bgm.mp3       # BGM
    │   ├── narration_C{N}.mp3  # ナレーション（あり時のみ）
    │   └── sfx/          # SE素材（任意）
    └── {project}_final.mp4  # 完成版マスター（BGM/SE/ナレ統合済み）
```

## 関連ドキュメント

- [`CLAUDE.md`](CLAUDE.md) — Claude Code 向けプロジェクト指示書（ワークフロールール集）
- [`docs/workflow_improvements.md`](docs/workflow_improvements.md) — ワークフロー・エージェント改善メモ（フィードバック・優先順位）
