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

## プロジェクト構造

```
output/
└── {番号}.{プロジェクト名}/
    ├── concept.md        # コンセプトシート
    ├── storyboard.md     # ストーリーボード
    ├── prompts.md        # 画像生成プロンプト
    ├── video-prompts.md  # 動画生成プロンプト
    ├── editing.md        # 編集指示書
    ├── edit.sh           # ffmpegスクリプト（任意）
    ├── images/
    │   └── scene_{N}/    # カットごとの静止画
    └── videos/
        └── scene_{N}/    # カットごとの動画
```
