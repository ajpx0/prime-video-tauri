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
| `src-tauri/src/script.js` | 注入される JS（Windows のみ）。先頭に **`__PVT_CSS__` を使う CSS 注入 IIFE**（`documentElement` 出現を待って `<style id="pvt-ext-css">` 追加）。ウィンドウ操作ボタン / 戻る / タイトルバー背景 / 再生中ドラッグバー（`#pvt-player-dragbar`）の生成。`pvt-has-nav`（ナビ有無）・`pvt-in-player`（サイズ > 0 の `.atvwebplayersdk-player-container` 有無。0×0 のコンテナも DOM に残るため可視判定が必須）のトグル。再生中はタイトル〜設定ボタンを含む祖先に `.pvt-player-topbar` を付け、CSS で 60px 下げる。`const ICONS` はボタンのグリフ文字（JS データ）。 |
| `src-tauri/src/custom.css` | **注入される見た目の唯一の定義元**（build.rs が script.js に埋め込む）。スクロールバー非表示 / フォント / ネイティブ navbar・footer 非表示 / ドラッグ領域 / ウィンドウ操作ボタンのスタイル / プレイヤー関連の調整。 |
| `src-tauri/tauri.conf.json` | `productName`（表示名 `Prime Video Tauri`）/ `mainBinaryName`（exe 名 `prime-video-tauri`。productName にスペースがあるため必須）/ `version`（リポジトリでは **常に `0.0.0`**、CI が実バージョンを差し込む）/ `identifier` / `resources: ["adg"]` など。ウィンドウタイトルは `lib.rs` の `.title()`。 |
| `src-tauri/adg/` | 同梱の **AdGuard Browser Extension（GPL-3.0）**。GitHub Releases の `edge-mv3.zip` を展開したもの + 同タグの `LICENSE`。更新時は `gh release download -R AdguardTeam/AdguardBrowserExtension -p edge-mv3.zip` → 中身を差し替え、LICENSE を残す。 |
| `.github/workflows/` | `build.yml`（main 以外への push でビルド検証）/ `release.yml`（main への push でリリース）/ `create_release_commit.yml`（手動実行でリリース用マージコミット作成）。 |

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
- chrome-devtools MCP は自前の Chrome を起動するため WebView2 に繋がらない。Node の `WebSocket` で `webSocketDebuggerUrl` に直接接続する。
- プレイヤーに入る: ストアフロントで `[data-testid="play"]` を click → 十数秒待つ（要ログイン・DRM 再生可）。
- コントロールは JS の合成 `mousemove` では出ない。CDP の `Input.dispatchMouseEvent`（`mouseMoved`）で実マウス移動させる。非表示時は上部コントロールの DOM ごと消え、表示時に再生成される。
- アプリを強制終了すると再生セッションが残り「最大ストリーミング再生数」で弾かれることがある（最大 10 分ほどで解除）。
- **OS ウィンドウドラッグの実挙動は CDP で検証不可**（`-webkit-app-region` の指定値は `getComputedStyle` で読めるが、実ドラッグは人間の実機確認が必要）。

## CI / リリース

- **`release.yml`（`main` への push で起動）**: **push されたコミットのタイトルがそのままバージョン**になる（`git log -1 --format=%s`）。`set_version` → ドラフトリリース作成 → `publish`（`sed` で `package.json` / `tauri.conf.json` / `Cargo.toml` の version を差し替え、`tauri-action@v1` で Windows ビルド & アップロード）→ リリース確定。
  - したがって **main へのコミットのタイトルは `0.0.7` のようなバージョン番号にする**。プレリリース（`0.0.6-1` 等）は MSI の制約で数字のみ・65535 以下。SemVer 上 `0.0.6-1 < 0.0.6` になる点に注意。
  - アセット名は `releaseAssetNamePattern: '[mainBinaryName]_[arch][setup][ext]'`（バージョンを含まない）。v0 では入力名が `assetNamePattern` で `[mainBinaryName]` も無かった。
- **`create_release_commit.yml`（`workflow_dispatch`）**: 入力 `source_branch`（既定 `develop`）と `version`（`x.y.z`）で、GitHub App トークン（`secrets.APP_PRIVATE_KEY`）を使い `source_branch → main` をマージコミット（タイトル = version）として作成 → `release.yml` が起動する。`GITHUB_TOKEN` での push はワークフローを起動しないため App トークンが必須。
- **`build.yml`（main 以外への push）**: `pnpm build` でビルド検証のみ。
- pnpm のバージョンはワークフローで明示指定せず、`package.json` の `packageManager` を単一ソースにする（`pnpm/action-setup` の `version` 指定は併用すると競合エラーになるため付けない）。

## コミット / PR 規約

- 回答は**日本語**。
- コミット: **Conventional Commits**・**英語**・**1 行**（本文/footer なし）・**GPG 署名必須**（`--no-verify` / `--no-gpg-sign` 禁止）。**依頼があるまで commit / push しない**。
- ローカル `git push` はオーナー（AariyJP）として行う（develop ルールセットの bypass あり。`Changes must be made through a pull request` 警告は出るが成功する）。
- **GitHub への書き込み（PR 作成・概要更新・コメント等）は GitHub App `aariyjp[bot]` 経由**: `~/ghs_token.ps1` でトークンを取得し `GH_TOKEN` をその場限りで使用（永続化しない）。bot として main に直接コミットする場合は GraphQL `createCommitOnBranch`（署名付き）を使う。
- リリースは Actions の **Create Release Commit** をバージョン指定で実行する。

## 既知の残課題

- **再生中のタイトルバー領域ドラッグ**（`#pvt-player-dragbar` を上端 60px・`z-index: 2147483646` で固定 + プレイヤー内ボタンを `no-drag`）の OS ドラッグ実挙動は人間の実機確認が必要。
- **再生中上部コントロールの一瞬のズレ**: コントロール再生成直後は `.pvt-player-topbar` 付与（MutationObserver → rAF）が間に合わず元位置に一瞬出る可能性がある。対策する場合も、動画はウィンドウ全面（ウィンドウ操作ボタンの背面）に表示したまま UI だけを下げること（`#dv-web-player` ごと下げる方式は不可）。
- **再生開始時のレーティング表示**（`.atvwebplayersdk-top-left-regulatory-overlay`）がタイトルバー領域に重なる場合がある。
