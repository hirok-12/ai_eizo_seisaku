# AI映像制作プロジェクト

## CM制作ワークフロー

CMを制作する際は、必ず以下の順序で進める。前工程の成果物が存在しない場合はスキップせず、前の工程から実行するよう誘導すること。

| ステップ | エージェント | 成果物 | 前提条件 |
|----------|-------------|--------|----------|
| 1. コンセプト設計 | `concept-design` | `concept.md` | なし（起点） |
| 2. 絵コンテ作成 | `storyboard` | `storyboard.md` | `concept.md` が存在すること |
| 3. 素材生成 | `asset-generation` | `prompts.md` + `images/` | `storyboard.md` が存在すること |
| 4. 動画生成 | `video-generation` | `video-prompts.md` + `videos/` | `prompts.md` と `images/` が存在すること |
| 5. 編集・仕上げ | `video-editing` | `editing.md` (+ `edit.sh`) | `video-prompts.md` と動画素材が存在すること |

### ルール

- ユーザーが途中のステップを指示した場合、該当プロジェクトの成果物を確認し、前提が揃っていなければ前の工程に誘導する
- 各成果物は `output/` 配下のプロジェクトディレクトリに保存する（例: `output/2.cupnoodle/concept.md`）
- プロジェクトディレクトリは `output/{番号}.{名前}/` の命名規則に従う

## 役割分担: 親オーケストレータ vs サブエージェント

**重要**: 各サブエージェント（`concept-design` / `storyboard` / `asset-generation` / `video-generation` / `video-editing`）は **ユーザーと直接対話できない**（`AskUserQuestion` が deferred tool で subagent context では利用不可）。

- **親オーケストレータ（メインの会話）**: ユーザーへのヒアリング・確認・選択肢提示は全て親が `AskUserQuestion` で実施
- **サブエージェント**: 親から渡された情報と既存成果物（`concept.md` 等）を読み取り、ファイル生成に専念。情報不足時は親に質問を返す

サブエージェント呼び出し時は、ヒアリング結果を構造化してプロンプトに含めて渡すこと。サブエージェントがユーザーに質問するパターンは禁止。

## クリエイティブ共通ルール

### 人物描写は全員日本人（デフォルト）

`concept.md` で「外国人」「ハーフ」等の例外指定がない限り、全カットで登場人物は日本人として描写する:

- 画像生成プロンプト（`asset-generation`）に `Japanese`、`typical Japanese facial features`、`straight black hair`、`soft Asian eye shape`、`authentic Japanese person` を必須で含める
- 動画生成プロンプト（`video-generation`）でも `Japanese` を再度明記（Veo がフレーム再生成時に外国人化するリスク回避）
- Character Anchor 文にも上記要素を盛り込む

### エンドカードは2層構造（情緒コピー + 商品識別情報）必須

CMの最終カット（エンドカード）は **「情緒メインコピー（上層）」＋「商品識別情報（下層）」の2層構造** を必須とする。情緒コピー単独だと「何の商品か」が伝わらず、ブランディング目的でも購買想起を欠く。

- `concept-design` フェーズで以下を必ず定義:
  - メインコピー（情緒）+ 予備2〜3案
  - 商品名（日本語+英語）、ブランドロゴ方針、必要に応じてカテゴリ・タグライン・CTA
- `asset-generation` で GPT Image 2 を `quality=high` で使い、3層レイアウト（上層: 情緒コピー / 中層: パッケージ・ロゴ / 下層: 商品名）を一体生成
- 日本語原文をプロンプトに直接埋め込み、`preserve text exactly as specified` を明示
- `video-generation` で Veo に `preserve all text and logos exactly, no deformation` を指定し、焼き込み画像のテキスト崩壊を防ぐ
- 後工程 `video-editing` でのテロップ合成は、焼き込みが崩れた場合のフォールバック位置づけ

GPT Image 2 は2026年時点で日本語17文字程度（ひらがな・カタカナ・漢字混在）まで実用描画可能。

### 音響設計はコンセプト段階で必ず定義

完成動画は **BGM/SE/ナレーションを統合した状態で書き出す**ことを原則とする。無音マスター提供は禁止（cupnoodle v1 で「BGMがないと感情がのらない」というフィードバックを反映）。

- `concept-design` で以下を必ず定義:
  - BGM の方向性（ジャンル / BPM / 楽器構成 / 感情曲線）
  - SE レイヤー（カット横断で必要な環境音）
  - ナレーション要否（動画完結→なし / 親世代訴求や感動系→あり / ハイブリッド）
- `storyboard` の各カット記述に BGM・SE・ナレーション欄を必須化
- `video-editing` で BGM トラック付きマスターを標準書き出し、最終ラウドネスを **-14 LUFS** に正規化

#### 音声生成スクリプト

| 用途 | スクリプト | モデル | 料金 |
|------|----------|--------|------|
| BGM 生成 | `scripts/generate-bgm.ts` | MiniMax Music 2.5 (fal.ai) | $0.035/生成 |
| ナレーション生成 | `scripts/generate-narration.ts` | OpenAI gpt-4o-mini-tts | 約$0.015/分 |

## プロジェクト構造

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
