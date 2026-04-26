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
- **エンドカードはキャッチコピー焼き込み必須**。`asset-generation` の画像生成段階で日本語コピーを焼き込み、後工程テロップ合成はフォールバック位置づけ。GPT Image 2 は `quality=high` で17文字程度の日本語を実用描画可能

## セットアップ

```bash
npm install
```

### 環境変数

`.env` ファイルをプロジェクトルートに作成:

```
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
FAL_KEY=your_fal_api_key_here   # 動画生成 A/B テストで Seedance 等を試す場合のみ
```

- OpenAI API キーは [OpenAI Platform](https://platform.openai.com/api-keys) から取得（画像生成用）
- Gemini API キーは [Google AI Studio](https://aistudio.google.com/apikey) から取得（Veo 動画生成用）
- fal.ai API キーは [fal.ai dashboard](https://fal.ai) から取得（任意。Seedance 2.0 等の比較検証用）

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

### 動画生成（参考）: Seedance 2.0 Fast（fal.ai 経由）

A/B 検証用に `scripts/generate-video-seedance.ts` も用意しているが、**本ワークフローでは標準採用していない**。

検証で判明した制約:

- **人物の肖像を含む画像が一律拒否される**（`content_policy_violation` / `partner_validation_failed`）。これは fal.ai 固有ではなく **Seedance 2.0 本体の方針**（2026年2月の Disney/Paramount 訴訟以降に強化された肖像権フィルタ）。BytePlus 公式 / WaveSpeed / Replicate でも同様
- 価格は Veo 3.1 Lite（$0.05/秒）の約5倍（$0.2419/秒）
- モーション品質・カメラワーク追従は Seedance が優位だが、人物が映るCMでは事実上使用不可

そのため **CM 用途では Veo 3.1 Lite 継続採用が現実解**。Seedance はランドスケープ等の人物なしカット限定で参照する位置づけ。

```bash
# 検証時のみ。FAL_KEY が設定されていることが前提
npx tsx --env-file .env scripts/generate-video-seedance.ts \
  --prompt "モーション指示" \
  --image input.png \
  --output output.mp4 \
  --aspect-ratio 9:16 \
  --duration 4 \
  --resolution 720p
```

### CM1本あたりの参考コスト

10カットのCMを制作する場合の目安:

| 工程 | 計算 | コスト |
|------|------|--------|
| 画像生成 (medium, 1024x1536) | 10枚 x $0.053 | $0.53 |
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
