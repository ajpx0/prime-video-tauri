# AGENTS.md — prime-video-tauri

エージェント(Codex / Claude など）向けのプロジェクトガイド。**回答・コミットメッセージ等の言語規約は末尾「コミット / PR 規約」を参照。**

## プロジェクト概要

Amazon Prime Video（`https://www.amazon.co.jp/gp/video/storefront`）を **castLabs Electron（ECS、Widevine 対応 Electron）** のフレームレスウィンドウ（`frame: false`）で開くデスクトップアプリ。独自のタイトルバー・ウィンドウ操作ボタン（戻る/最小化/最大化/閉じる）をページに JS/CSS 注入で実現し、広告ブロック（Ghostery）と Discord Rich Presence を行う。

- 独自フロントエンドのビルドは無し（リモート URL を直接表示）。
- Tauri（WebView2）からの移行理由: WebView2 の音声はアプリのプロセスツリーに帰属せず、Windows の process-loopback キャプチャ（Discord / OBS のウィンドウ音声）が無音になる。Electron はメインプロセスが Chromium の browser プロセスなのでアプリ単位で取れる。
- 現状 **Windows のみ対応**（ビルド設定・CI が Windows のみ）。
- 名前は互換のため `prime-video-tauri` / `Prime Video Tauri` のまま。

## 技術スタック

- **castLabs Electron**（`github:castlabs/electron-releases#v<ver>+wvcus`。npm 非公開のため GitHub 参照）。バイナリは `postinstall` ではなく初回 `require('electron')`（`pnpm dev`）時に `install.js` がダウンロードする
- パッケージ管理: **pnpm**（`packageManager: pnpm@11.2.2`、バージョンは `package.json` の packageManager に従う＝CI でも明示指定しない）。`pnpm-workspace.yaml` の `allowBuilds` でビルドスクリプト可否を指定（`electron-winstaller` は不要なので false）
- npm: `@ghostery/adblocker-electron`（広告ブロック）/ `@xhayper/discord-rpc`（Rich Presence）/ `electron-builder`（パッケージング）

## 主要ファイル

| パス | 役割 |
| --- | --- |
| `src/main.js` | メインプロセス（ESM）。起動時に `script.js` の **`__PVT_CSS__`** を `JSON.stringify(custom.css)` で置換して注入コードを作る。`components.whenReady()`（Widevine CDM の導入待ち）と Ghostery の初期化を待ってから `BrowserWindow`（1280×800 / 最小 990×600 / `frame: false` / 背景 `#2d2d2d`）を作成。`app.isPackaged` でなければ `--remote-debugging-port`（既定 9222、`PVT_CDP_PORT` で変更可）。UA から `Electron/…` と `PrimeVideoTauri/…` を除去。IPC: `window`（minimize / toggleMaximize / close / isMaximized）/ `update_activity`（Rich Presence）/ `pvt-inject`（注入コードを同期返却）。ページタイトルでウィンドウタイトルを上書きしない。 |
| `src/preload.cjs` | メインフレームのみの preload（sandbox 既定のため CJS・`fs` 不可）。`contextBridge` で **`window.__TAURI__` 互換シム**（`window.getCurrentWindow()` → minimize / toggleMaximize / close / isMaximized / onResized、`core.invoke(cmd, args)` → `ipcRenderer.invoke`）を公開し、`ipcRenderer.sendSync('pvt-inject')` で受け取ったコードを `webFrame.executeJavaScript` で **main world にドキュメント開始時点で実行**。onResized はメインの `maximize` / `unmaximize` で発火。 |
| `src/script.js` | 注入される JS（Tauri 版から無変更）。先頭に **`__PVT_CSS__` を使う CSS 注入 IIFE**（`documentElement` 出現を待って `<style id="pvt-ext-css">` 追加）。ウィンドウ操作ボタン / 戻る / タイトルバー背景 / 再生中ドラッグバー（`#pvt-player-dragbar`）の生成。`pvt-has-nav`（ナビ有無）・`pvt-in-player`（サイズ > 0 の `.atvwebplayersdk-player-container` 有無。0×0 のコンテナも DOM に残るため可視判定が必須）のトグル。再生中はタイトル（無ければ閉じるボタン。再生開始直後のレーティング表示中はタイトルが DOM に無い）〜設定ボタンを含む祖先に `.pvt-player-topbar` を付け、CSS で 60px 下げる。レーティング表示（`.atvwebplayersdk-top-left-regulatory-overlay`）は `.pvt-player-topbar` の外にある場合だけ CSS で単独に 60px 下げる（中にある場合は二重にならないよう打ち消す）。`const ICONS` はボタンのグリフ文字（JS データ）。 |
| `src/custom.css` | **注入される見た目の唯一の定義元**（main.js が script.js に埋め込む）。スクロールバー非表示 / フォント / ネイティブ navbar・footer 非表示 / ドラッグ領域 / ウィンドウ操作ボタンのスタイル / プレイヤー関連の調整。 |
| `scripts/evs-sign.cjs` | electron-builder の `win.signtoolOptions.sign`（カスタム署名）。`EVS_SIGN=1` かつ対象が `prime-video-tauri.exe` のときだけ `evs-vmp sign-pkg <dir>` で VMP 署名（未設定なら何もしない＝未署名ビルド）。`afterPack` だと後続の rcedit（exe リソース書き換え）で署名が壊れ、`afterSign` は Authenticode 証明書が無いとスキップされるため、この位置で行う。確認は `evs-vmp verify-pkg dist/win-unpacked`。 |
| `package.json` | `main` / scripts / electron-builder 設定（`build`）。`productName`（表示名 `Prime Video Tauri`）/ `executableName`（exe 名 `prime-video-tauri`）/ `electronVersion` と `electronDownload`（castLabs の mirror `…/releases/download/` と `<ver>+wvcus`。mirror 末尾に `v` を付けると `vv…` になり 404）/ `artifactName`（`${name}_${arch}-setup.${ext}`、バージョン無し）/ `win.target: [nsis, dir]`。`version` はリポジトリでは **常に `0.0.0`**。 |
| `.github/workflows/` | `build.yml`（main 以外への push でビルド検証）/ `release.yml`（main への push でリリース）/ `create_release_commit.yml`（手動実行でリリース用マージコミット作成）。 |

## 開発・ビルドコマンド

```sh
pnpm install
pnpm dev      # = electron .。CDP(:9222) 有効。src の変更は再起動で反映（自動リロード無し）
pnpm build    # = electron-builder --dir（dist/win-unpacked）
pnpm dist     # = electron-builder（NSIS インストーラ dist/prime-video-tauri_x64-setup.exe）
```

- castLabs Electron を更新するときは `devDependencies.electron` のタグと `build.electronVersion` / `build.electronDownload.version` を揃える。

## 注入アーキテクチャ（要点）

1. main.js が起動時に `custom.css` と `script.js`（`__PVT_CSS__` プレースホルダ入り）を結合（ビルド時生成は無し）。
2. preload.cjs が `ipcRenderer.sendSync('pvt-inject')` で受け取り、`webFrame.executeJavaScript` で main world に **1 本だけ注入**（ページ CSP の影響を受けない）。
3. 実行時、IIFE が `custom.css` の内容を `<style id="pvt-ext-css">` として注入し、続く JS がボタン等を構築。ウィンドウ操作・Rich Presence は `window.__TAURI__` 互換シム経由で IPC に流れる。

## 広告ブロック

- **Ghostery**（`ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)` → `enableBlockingInSession(session.defaultSession)`）。起動ごとに CDN から取得（失敗時はブロック無しで起動）。ブロックは `net::ERR_BLOCKED_BY_CLIENT` になる。
- AdGuard MV3 は不採用: `session.extensions.loadExtension` で読み込めるが、Electron は `declarativeNetRequest` が API だけ存在して実際にはルールが効かない（動的ルールを追加しても遮断されない）うえ `tabs.create` も無い。

## Discord Rich Presence

- `script.js` が `window.fetch` をラップし、`playerChromeResources` のレスポンスの `resources.catalogMetadataV2`（`catalog.seriesTitle` / `title` / `entityType`、`images.boxartImage`）を取得。`nextUpV3` は次話なので使わない。
- 再生中の video は `#dv-web-player video`（`blob:` src・サイズ > 0）。プレイヤーコンテナ内ではない。詳細ページの予告編は `.draper-player-container` 側。
- 表示: details = 作品名（映画はタイトル）、state = 話タイトル（S/E 番号は付けない）、large_image = boxart URL（256 バイト超は付けない）、再生中は start/end（秒）で進行バー。一時停止中・非視聴時・オフ時は `makeActivity()`（Watching・起動時刻からの経過）の既定表示。
- details / state は UTF-16 で 2〜128 に収める（超過は 127 + `…`、不足は `⠀` 埋め）。
- アカウントメニューの「Rich Presence」チェックボックスで切替（`localStorage` の `pvt-rich-presence`、既定オン）。
- Discord 未起動・切断時は黙って 15 秒ごとに再接続し、接続時に現在のアクティビティを再送する。

## Widevine / VMP

- `components.whenReady()` で Widevine CDM が導入される（初回起動はダウンロード待ち）。`navigator.requestMediaKeySystemAccess('com.widevine.alpha', …)` が resolve すれば CDM は利用可能。
- castLabs の配布バイナリは開発用 VMP 署名のみ。Prime Video は VMP 署名が無効だとエラー 7031 で再生できない。**EVS による VMP 署名（streaming）で再生できることを確認済み**（exe 名変更・asar integrity 書き換えで同梱の `electron.exe.sig` は使えない）。
- EVS アカウント作成（初回のみ、手動）: `uv tool install castlabs-evs`（pip なら `python -m pip install --upgrade castlabs-evs`）→ `evs-account signup`。ローカル署名ビルドは `EVS_SIGN=1 pnpm dist`。

## 実装規約・落とし穴

- **preload はメインフレームのみ**（`nodeIntegrationInSubFrames` 無効）。script.js 側も `window.top !== window.self` で iframe を除外している。
- **プレイヤーのセレクタは安定した `atvwebplayersdk-*` を使う**。旧 `.f1kranz6` / `.f14k152h` は Amazon のハッシュ変更で陳腐化しており使用禁止（`script.js` 冒頭の `__pvtVersion` の `f1kranz6` はその名残）。
- **`-webkit-app-region`（ウィンドウドラッグ）**: `drag` 加算 / `no-drag` 減算 / **ペイント順で後勝ち**、`none`（既定）は無効果。`no-drag` を効かせるには、その要素が `drag` 要素より**前面（後に描画）**である必要がある。プレイヤーのボタンは低 z（`z:auto`）の別スタッキングコンテキストにあるため、body 直下の高 z な drag 要素では覆えてしまう点に注意。
- ウィンドウ操作ボタンは body 直下・`z-index: 2147483647`・`no-drag`、右上 138px（各 46px）。戻るは左上 46px。
- **改行は LF**（`.gitattributes: * text=auto eol=lf`）。Windows 編集時の CRLF 警告は正規化されるだけで問題なし。
- **生成コードにコメントを書かない**（既存コメントは残す）。
- `package.json` の `version` は **`0.0.0` のまま**にする（CI が上書き）。

## デバッグ（CDP）

- 未パッケージ（`pnpm dev`）は `http://localhost:9222`（`PVT_CDP_PORT` で変更可）に CDP を公開。`/json` で page ターゲット、WebSocket で `Runtime.evaluate`。
- chrome-devtools MCP は自前の Chrome を起動するためアプリに繋がらない。Node の `WebSocket` で `webSocketDebuggerUrl` に直接接続する。
- プレイヤーに入る: ストアフロントで `[data-testid="play"]` を click → 十数秒待つ（要ログイン・DRM 再生可）。
- コントロールは JS の合成 `mousemove` では出ない。CDP の `Input.dispatchMouseEvent`（`mouseMoved`）で実マウス移動させる。非表示時は上部コントロールの DOM ごと消え、表示時に再生成される。
- `window.__TAURI__` は contextBridge 経由で freeze されており、CDP から `invoke` をラップしても効かない（呼び出し確認は一時的なデバッグ出力で行う）。
- アプリを強制終了すると再生セッションが残り「最大ストリーミング再生数」で弾かれることがある（最大 10 分ほどで解除）。
- **OS ウィンドウドラッグの実挙動は CDP で検証不可**（`-webkit-app-region` の指定値は `getComputedStyle` で読めるが、実ドラッグは人間の実機確認が必要）。

## CI / リリース

- **`release.yml`（`main` への push で起動）**: **push されたコミットのタイトルがそのままバージョン**になる（`git log -1 --format=%s`）。`set_version` → ドラフトリリース作成 → `publish`（`sed` で `package.json` の version を差し替え、`pnpm dist --publish never` で NSIS をビルドし `gh release upload` でドラフトに添付）→ リリース確定。
  - secrets `EVS_ACCOUNT_NAME` / `EVS_PASSWD` があれば `castlabs-evs` を入れて `reauth` し、`EVS_SIGN=1` で VMP 署名する（無ければスキップ＝未署名）。
  - したがって **main へのコミットのタイトルは `0.0.7` のようなバージョン番号にする**。SemVer 上 `0.0.6-1 < 0.0.6` になる点に注意。
  - アセット名は `prime-video-tauri_x64-setup.exe`（`artifactName`、バージョンを含まない）。
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
- **Discord / OBS のウィンドウ単位の音声キャプチャは実機未検証**（プロセスツリーのループバックキャプチャで音が取れることは確認済み）。
