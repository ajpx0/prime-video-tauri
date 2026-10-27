# AGENTS.md — prime-video-tauri

エージェント(Codex / Claude など）向けのプロジェクトガイド。**回答・コミットメッセージ等の言語規約は末尾「コミット / PR 規約」を参照。**

## プロジェクト概要

Amazon Prime Video（`https://www.amazon.co.jp/gp/video/storefront`）を **Tauri v2 のネイティブウィンドウ（Windows / WebView2）** で開くデスクトップアプリ。フレームレス（`decorations: false`）で、独自のタイトルバー・ウィンドウ操作ボタン（戻る/最小化/最大化/閉じる）をページに JS/CSS 注入で実現し、広告ブロック拡張（`adg`）の読み込みと Discord Rich Presence を行う。

- 独自フロントエンドのビルドは無し（リモート URL を直接表示）。
- 現状 **Windows のみ対応**。mac 対応は将来課題（WebView2 固有機能の分岐が必要）。

## 技術スタック

- **Tauri v2**（Rust）/ **WebView2**（Windows）
- パッケージ管理: **pnpm**（`packageManager: pnpm@11.2.2`、バージョンは `package.json` の packageManager に従う＝CI でも明示指定しない）
- Rust crate: `tauri`, `discord-rich-presence`, `chrono`, `tauri-plugin-opener`, `serde` / `serde_json`
- ビルド時コード生成: `build.rs`（`serde_json` を `[build-dependencies]` に含む）

## 主要ファイル

| パス | 役割 |
| --- | --- |
| `src-tauri/src/lib.rs` | `WebviewWindow` 構築。**`#[cfg(target_os = "windows")]` 限定で `initialization_script` 注入**。`--load-extension={adg}` で広告ブロック読込。Discord Rich Presence。debug 時 `--remote-debugging-port=9222`（CDP）。 |
| `src-tauri/build.rs` | ビルド時に `src/script.js` + `src/custom.css` を結合し、`script.js` 内のプレースホルダ **`__PVT_CSS__`** を `serde_json::to_string(custom.css)` で置換 → `OUT_DIR/inject.js` を生成。`cargo:rerun-if-changed=src/script.js` / `src/custom.css` を出力（**この 2 行は必須**：tauri_build が自前の rerun-if を出すため、消すと変更時に再生成されない）。 |
| `src-tauri/src/script.js` | 注入される JS（Windows のみ）。先頭に **`__PVT_CSS__` を使う CSS 注入 IIFE**（`documentElement` 出現を待って `<style id="pvt-ext-css">` 追加）。ウィンドウ操作ボタン / 戻る / タイトルバー背景 / 再生中ドラッグバー（`#pvt-player-dragbar`）の生成。`pvt-has-nav`（ナビ有無）・`pvt-in-player`（`.atvwebplayersdk-player-container` 有無）のトグル。`const ICONS` はボタンのグリフ文字（JS データ）。 |
| `src-tauri/src/custom.css` | **注入される見た目の唯一の定義元**（build.rs が script.js に埋め込む）。スクロールバー非表示 / フォント / ネイティブ navbar・footer 非表示 / ドラッグ領域 / ウィンドウ操作ボタンのスタイル / プレイヤー関連の調整。 |
| `src-tauri/tauri.conf.json` | `productName` / `version`（リポジトリでは **常に `0.0.0`**、CI が実バージョンを差し込む）/ `identifier` / `resources: ["adg"]` / `decorations` など。 |
| `src-tauri/adg/` | WebView2 に読み込む広告ブロック拡張のディレクトリ。 |
| `.github/workflows/` | `build.yml`（main 以外への push でビルド検証）/ `release.yml`（main への push でリリース）。 |

## 開発・ビルドコマンド

```sh
pnpm install
pnpm dev      # = tauri dev。src-tauri を監視し変更で自動再ビルド・再起動。debug は CDP(:9222) 有効
pnpm build    # = tauri build --no-bundle
# Rust だけ型チェック:
cargo check --manifest-path src-tauri/Cargo.toml
```

- `script.js` / `custom.css` を編集すると build.rs が `inject.js` を再生成する（`pnpm dev` 中は自動）。

## 注入アーキテクチャ（要点）

1. `custom.css`（CSS）と `script.js`（JS、`__PVT_CSS__` プレースホルダ入り）を **ビルド時に `build.rs` が結合** → `OUT_DIR/inject.js`。
2. `lib.rs` が `initialization_script(include_str!(concat!(env!("OUT_DIR"), "/inject.js")))` で **1 本だけ注入**（Windows 限定）。
3. 実行時、IIFE が `custom.css` の内容を `<style id="pvt-ext-css">` として注入し、続く JS がボタン等を構築。

## 実装規約・落とし穴

- **注入は Windows 限定**（`#[cfg(target_os = "windows")]`）。`additional_browser_args` / `browser_extensions_enabled` / `adg` 読込は WebView2 専用で mac では機能しない。
- **プレイヤーのセレクタは安定した `atvwebplayersdk-*` を使う**。旧 `.f1kranz6` / `.f14k152h` は Amazon のハッシュ変更で陳腐化しており使用禁止（`script.js` 冒頭の `__pvtVersion` の `f1kranz6` はその名残）。
- **`-webkit-app-region`（ウィンドウドラッグ）**: `drag` 加算 / `no-drag` 減算 / **ペイント順で後勝ち**、`none`（既定）は無効果。`no-drag` を効かせるには、その要素が `drag` 要素より**前面（後に描画）**である必要がある。プレイヤーのボタンは低 z（`z:auto`）の別スタッキングコンテキストにあるため、body 直下の高 z な drag 要素では覆えてしまう点に注意。
- ウィンドウ操作ボタンは body 直下・`z-index: 2147483647`・`no-drag`、右上 138px（各 46px）。戻るは左上 46px。
- **改行は LF**（`.gitattributes: * text=auto eol=lf`）。Windows 編集時の CRLF 警告は正規化されるだけで問題なし。
- **生成コードにコメントを書かない**（既存コメントは残す）。
- `tauri.conf.json` / `package.json` / `Cargo.toml` の `version` は **`0.0.0` のまま**にする（CI が上書き）。

## デバッグ（CDP）

- debug ビルドは `http://localhost:9222` に CDP を公開。`/json` で page ターゲット、WebSocket で `Runtime.evaluate`。
- プレイヤーに入る: ストアフロントで `[data-testid="play"]` を click → 十数秒待つ（要ログイン・DRM 再生可）。コントロールは mousemove で表示。
- **OS ウィンドウドラッグの実挙動は CDP で検証不可**（`-webkit-app-region` の指定値は `getComputedStyle` で読めるが、実ドラッグは人間の実機確認が必要）。

## CI / リリース

- **`release.yml`（`main` への push で起動）**: **マージコミット（push されたコミット）のタイトルがそのままバージョン**になる（`git log -1 --format=%s`）。`set_version` → ドラフトリリース作成 → `publish`（`sed` で `package.json` / `tauri.conf.json` / `Cargo.toml` の version を差し替え、`tauri-action` で Windows ビルド & アップロード）→ リリース確定。
  - したがって **main へのマージコミットのタイトルは `0.0.4` のようなバージョン番号にする**（PR の auto-merge では「マージコミットタイトル」をバージョンに設定する運用）。
- **`build.yml`（main 以外への push）**: `pnpm build` でビルド検証のみ。
- pnpm のバージョンはワークフローで明示指定せず、`package.json` の `packageManager` を単一ソースにする（`pnpm/action-setup` の `version` 指定は併用すると競合エラーになるため付けない）。

## コミット / PR 規約

- 回答は**日本語**。
- コミット: **Conventional Commits**・**英語**・**1 行**（本文/footer なし）・**GPG 署名必須**（`--no-verify` / `--no-gpg-sign` 禁止）。**依頼があるまで commit / push しない**。
- ローカル `git push` はオーナー（AariyJP）として行う（develop ルールセットの bypass あり。`Changes must be made through a pull request` 警告は出るが成功する）。
- **GitHub への書き込み（PR 作成・概要更新・コメント等）は GitHub App `aariyjp[bot]` 経由**: `~/ghs_token.ps1` でトークンを取得し `GH_TOKEN` をその場限りで使用（永続化しない）。
- リリースは `develop → main` の PR を auto-merge（マージコミットタイトル = バージョン、本文空、Assignee/Reviewer = AariyJP）で行う。

## 既知の残課題

- **再生中のタイトルバー領域ドラッグ**（`#pvt-player-dragbar` を `z-index:-1` 全幅 + プレイヤー内ボタンを `no-drag`）は、要素配置・`app-region` 指定までは確認済みだが **OS ドラッグの実挙動が未検証**。動かない場合はドラッグ要素を**プレイヤーオーバーレイの内側に prepend**（同一スタッキングコンテキスト）する方式に切り替える。
