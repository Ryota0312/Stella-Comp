# Stella Comp

星景写真の合成・レタッチを行うWebアプリケーション。

## 目的

三脚固定撮影や極軸合わせが不十分な撮影で発生する星の位置ずれを補正し、複数枚の短時間露光画像を合成してノイズの少ない星空画像を得る。

## 初期スコープ

- 複数画像のアップロード
- アップロード前の軽量プレビュー画像生成
- 基準画像の選択
- 軽量プレビュー画像を使った星の位置合わせ
- 元画像への変換行列適用
- 元画像を使った加算平均合成
- 位置合わせ結果の低解像度プレビュー表示
- 処理結果画像のダウンロード
- 処理ジョブの状態確認

比較明合成、詳細なレタッチ、バッチ管理、ユーザーアカウントは初期 MVP では後回しにする。

## UI 方針

星景写真を扱う作業画面として、MVP の Web UI は黒基調のダークテーマを標準にする。背景とパネルは黒からチャコールの低彩度色を使い、プレビュー画像や合成結果の視認性を優先し、入力、キュー、進捗、警告、エラーは暗色背景上で十分なコントラストを確保する。配色の役割は、シアンを現在ステップ・選択状態・プレビュー処理、青を「次のフェーズへ進む」CTA、緑を TIFF など成果物のダウンロードと成功状態、グレーを戻る・開く・クリアなどの補助操作、アンバーを警告や処理中、赤をエラーや失敗に割り当てる。次フェーズ CTA は通常のシアン系処理ボタンより強く表示し、シアンの塗りボタンは乱用せず淡い背景や境界線で処理系操作を示す。

画面左上の hero 表示では、サービス名 `Stella Comp` を主見出しとして強調し、星景写真の位置合わせとコンポジットを行うサービスであることを短い説明で示す。作業領域を確保するため、PC 版では hero をコンパクトに保ち、プレビュー容量や圧縮率などの内部寄りメトリクスは常時表示しない。

PC 版の MVP UI は 1366x768 を基準に、ページ全体のスクロールを発生させないステップ式ワークスペースにする。ステップは「アップロード」「プレビュー合成」「本画像合成」の 3 段階とし、URL 遷移ではなく同一 SPA 画面内の表示切り替えで扱う。可変長のファイルキューや警告一覧だけはパネル内スクロールを許容する。

アップロードステップでは、ファイル選択、軽量 preview JPEG 生成、基準画像選択までをブラウザ内で行う。この時点では preview JPEG をサーバーへアップロードしない。ファイル選択直後の基準フレーム初期値は、選択順が概ね時系列である前提で中央のフレームにする。ユーザーが「プレビュー合成へ」を実行したタイミングで preview JPEG をアップロードし、位置合わせ推定とブラウザ側 preview 合成を開始する。preview 合成結果は、選択された基準フレームの preview JPEG と切替または左右並びで比較できるようにし、カーソル位置のピクセル等倍確認でノイズ低減を確認できるようにする。preview 合成結果を確認した後、明示操作で本画像合成ステップへ進み、RAW 現像と元画像合成を実行する。

選択済みの元画像、生成済み preview、合成結果の Blob URL はブラウザ内の作業状態として保持する。画像を1枚以上選択した後は、ユーザーが明示的にキューをクリアするまで、リロード、タブ閉じ、URL 遷移、通常の同一タブリンク遷移で離脱警告を表示し、意図しない作業内容の喪失を防ぐ。結果生成やダウンロード完了だけでは警告を解除しない。

## サポートするファイル

以下の画像ファイルをサポートする。

- RAW画像
  - CR2
  - CR3
- JPEG画像
  - jpg
  - jpeg
- TIFF画像
  - tif
  - tiff

## 技術方針

- Webバックエンドは Go と gin を使う。
- Webフロントエンドは TypeScript と Next.js を使う。
- 星位置合わせ、特徴点検出、アフィン変換、合成は、処理内容に応じて TypeScript、ブラウザ WASM/Worker、Rust worker を使い分ける。
- Go API と Rust worker の境界は gRPC/Protocol Buffers で定義する。Rust worker は位置合わせ推定、比較用サーバー処理、将来の有料/高品質サーバー処理候補として扱う。
- ツールバージョンは mise で固定する。
- Docker Compose では HTTPS Portal、nginx、Next.js、Go API、Rust worker、Valkey を起動する。HTTPS Portal で TLS 終端し、nginx で `/` と `/api/` を振り分ける。詳細は `spec/deployment.md` を参照する。
- Redis 互換キュー基盤は Valkey を標準候補にする。MVP の現在実装はまだ Go API プロセス内メモリのジョブ管理だが、API 複数 replica 化や再起動耐性が必要になる段階で job store と queue を Valkey へ移す。

## 画像処理方針

サーバー負荷を抑えるため、RAW/TIFF などの元画像処理は可能な限りクライアントサイドで実行する。ブラウザ WASM/Worker/Canvas で RAW 現像、変換行列適用、加算平均合成が成立するかを優先して検証する。

星の位置合わせに使う変換行列の推定は、元画像より軽いプレビュー画像を使って高速化する。ブラウザはアップロード前に軽量 JPEG または縮小画像を生成し、当面は preview JPEG だけをサーバへ送信する。元画像は原則としてブラウザ内に保持し、将来のサーバー処理オプションでは明示的にアップロードする。

初期の Web 実装では、RAW ファイルも D&D の入力として受け付ける。ただし、ブラウザ標準 API では CR2/CR3 を直接デコードできる前提にしない。D&D 直後は重い RAW 現像を開始せず、ファイル内の埋め込み JPEG 候補を既存 Web Worker で抽出して軽量 preview JPEG 生成に使う。preview JPEG のアップロード、位置合わせ推定、preview 合成結果生成は D&D 後に自動実行する。ユーザーが preview 合成結果を確認して本画像合成ステップへ進んだ時点で、`libraw-wasm` を使って RAW 本体をブラウザ側 WebAssembly/Worker で現像し、preview で推定済みの変換行列を元画像座標系へ補正して合成する。RAW 現像と元画像合成中は、処理中フレーム数ベースの進捗を表示する。本画像合成ステップ内の実行ボタンは、再実行や将来の本画像合成オプション変更後の実行操作として残す。

初期処理フロー:

1. ブラウザで元画像を選択する。
2. ブラウザで軽量プレビュー画像を生成する。RAW は埋め込みプレビュー抽出を優先し、この段階では `libraw-wasm` 現像を実行しない。
3. Go API に軽量プレビュー画像を自動アップロードする。
4. Rust worker が軽量プレビュー画像からアフィン変換行列を自動推定する。
5. Go API が推定した変換行列を Web UI へ返す。
6. Web UI がブラウザ上で preview JPEG に変換行列を適用し、加算平均合成する。
7. Web UI が preview 合成結果を PNG としてプレビュー、基準フレームと比較、ピクセル等倍確認、ダウンロードできるようにする。
8. ユーザー確認後、本画像合成ステップへ進む操作をトリガーに、ブラウザで RAW を現像し、preview 座標系の変換行列を元画像座標系へ補正して RAW 現像画像を加算平均合成する。処理中は本画像処理の進捗バーを表示し、プレビュー合成後の画面で選択した TIFF / PNG / JPEG の成果物をダウンロードできるようにする。画面表示と等倍確認用 preview は PNG を併せて生成する。

MVP の現在実装では、D&D 後に preview JPEG の準備が完了した時点で Web UI が preview JPEG をアップロードし、`POST /api/preview-alignments` で非同期ジョブを作成し、Go API が Rust worker の `EstimateTransforms` から各画像の 2x3 アフィン変換行列を取得する。Web UI は `GET /api/preview-alignments/:alignmentJobID` を polling し、完了後に返却された行列を使ってブラウザの Canvas 上で preview JPEG を変換し、加算平均した PNG を生成する。結果表示では合成 PNG と基準フレームの preview JPEG を切り替え表示または左右比較でき、カーソル位置の等倍クロップを基準/合成で並べてノイズ低減を確認できる。結果画像の上には状態、形式、操作ボタンなどの常時表示 UI を重ねず、表示モード、書き出し操作、警告は画像外に配置する。ただし preview 合成中と本画像合成中は、前回結果を薄く残した半透明オーバーレイで処理中状態を右ペインにも一時表示し、本画像処理のフレーム進捗がある場合は同じオーバーレイ内にも表示する。プレビューを開く/ダウンロード操作は表示モード付近に置き、最終結果フェーズでは選択中の成果物形式（TIFF / PNG / JPEG）のダウンロードを同じ操作群の主操作として強調する。フェーズ遷移ボタンは結果画像側へ重ねず、処理状況パネル側の通常フローに配置する。さらに、ユーザー確認後に本画像合成ステップへ進んだ時点で `libraw-wasm` による RAW 現像と、preview 行列を元画像サイズへスケール補正した Canvas 上での RAW 現像画像の加算平均合成を試す。RAW 現像と元画像合成中は、読み込み・合成・選択形式の書き出し進捗を表示する。最終結果フェーズの等倍比較では、合成結果と同じ現像/デコード経路で作った基準フレーム PNG を比較対象に使い、preview JPEG を基準画像として混ぜない。結果表示は PNG preview とし、ダウンロード成果物はプレビュー合成後の画面で TIFF / PNG / JPEG から選択する。TIFF は 16bit 後処理向け、PNG は劣化なしの 8bit 出力、JPEG はスマホ保存・共有向けの軽量出力として扱い、TIFF 選択時だけ TIFF エンコードを追加で実行する。本画像合成ステップ内の実行ボタンは再実行および将来のオプション変更後の実行用として残す。`POST /api/jobs` は従来のサーバー側 preview JPEG 合成の比較・フォールバック用として残す。Go API は `STELLA_COMP_DATA_DIR` を起動時に絶対パスへ正規化し、worker へ絶対パスを渡す。ジョブ永続化は後続で実装する。

通常のユーザー向け UI は星景写真家が判断に使う情報を優先し、フレーム数、preview 生成状況、位置合わせ/合成状況、本画像処理進捗、書き出し形式、警告だけを主表示にする。選択済みフレーム一覧は基準フレームを選びやすい高密度表示を優先し、サムネイル、preview サイズ、ステータスと重複する説明文は通常表示しない。preview payload、圧縮率、アップロード件数、alignment job ID、内部ステータス、warning code などのデバッグ情報は `NEXT_PUBLIC_DEPLOY_STAGE=staging` または `NEXT_PUBLIC_APP_ENV=staging` の場合のみ、実行パネル下部の staging debug 枠に表示する。

preview JPEG の位置合わせは AKAZE 特徴点を使い、短時間の星景フレームに合わせて回転・平行移動・等方スケールの部分アフィン変換を推定する。MVP では、RANSAC で妥当な変換を推定できないフレームは `TRANSFORM_ESTIMATE_FAILED` warning を付けて identity transform を返し、クライアント側合成全体は可能な限り完了させる。これは結果ファイル確認を優先するための暫定挙動であり、後続で星検出ベースのマッチングやより安定した変換推定へ置き換える。

ブラウザ側でのアフィン変換行列の適用は、まず preview JPEG の PoC 合成で検証する。最終的な本画像合成では、preview 座標系の変換行列を元画像座標系へ補正し、まずブラウザ WASM で重いピクセル処理を担えるかを実測する。後処理前提の本処理成果物は TIFF を基本形式にしつつ、PNG と JPEG も選択可能にする。サーバー負荷を避けるため、プロトタイプでは RAW 現像もブラウザ側で試す。

プレビュー画像で得た変換行列を元画像に適用するため、元画像サイズ、プレビュー画像サイズ、EXIF 回転、RAW 現像時のクロップや回転を追跡する。

## 既存実装の活用

[`Ryota0312/hoshikasane`](https://github.com/Ryota0312/hoshikasane) の Rust 実装を調査した結果、`stellacomp` ライブラリクレートに以下の機能が存在する。

- AKAZE 特徴点検出
- BFMatcher による特徴点マッチング
- RANSAC によるアフィン推定
- OpenCV によるワープ処理
- 加算平均合成
- 比較明合成
- CR3 と TIFF の読み込み

新規プロジェクトでは、この処理のうち位置合わせ推定と比較用サーバー処理を Rust worker として取り込み、Go API から gRPC でジョブ単位に呼び出す。最終変換と合成はまずブラウザ側で元画像を使う構成へ拡張する。サーバー側での高品質処理は、将来の課金形態や高負荷処理向けの選択肢として残す。

## hoshikasane からの Rust 移植方針

既存実装 [`Ryota0312/hoshikasane`](https://github.com/Ryota0312/hoshikasane) の `stellacomp` ライブラリクレートを、初期 MVP の Rust 画像処理コアとして `crates/stellacomp` へ移植する。

移植対象:

- `calc.rs`
  - AKAZE 特徴点検出
  - BFMatcher による特徴点マッチング
- `imageproc.rs`
  - 比較明合成
  - 加算平均合成
  - 二値化
- `utils.rs`
  - `DynamicImage` と OpenCV `Mat` の相互変換
  - CR3/TIFF/JPEG などのファイル読み込み
- CLI の `AffineConvert` にある処理
  - 対応点抽出
  - RANSAC によるアフィン推定
  - `warp_affine` による位置合わせ

新しい `crates/stellacomp` では、CLI 向けの処理を worker から呼びやすいライブラリ API に整理する。初期 API は `AlignAndAverageInput` を受け取り、複数画像の位置合わせと加算平均合成を行い、成果物を `output_path` に保存する。

初回移植時に修正する点:

- 既存の `average` は2枚ずつ平均するため、3枚以上では厳密な算術平均にならない。MVP では累積和ベースの `average_images` を追加する。
- 拡張子判定は `CR3` と `tiff` に偏っているため、大小文字を正規化し、`jpg/jpeg/tif/tiff/cr3` を扱う。
- CLI 直下にあったアフィン推定とワープ処理は、`align_and_average` の内部処理として `crates/stellacomp` に移す。
- `proto` の `source_path` と `preview_path` は、MVP では JPEG-only 縦断を優先し、`preview_path` があれば位置合わせ入力として使う。元画像側の RAW/TIFF 反映と座標変換補正は後続で拡張する。

## 現在の API 実装

- `POST /api/preview-uploads`
  - `multipart/form-data` の `previews` フィールドを `.data/uploads/previews/<session-id>/` に保存する。
- `POST /api/preview-alignments`
  - JSON の `sessionId` と `baseImageIndex` を受け取り、preview upload セッション内のファイルを名前順で Rust worker に渡す非同期ジョブを作成する。
  - レスポンスは `202 Accepted` と `alignmentJobId`、`queued` 状態のジョブ情報。
- `GET /api/preview-alignments/:alignmentJobID`
  - Go API プロセス内メモリで管理している `queued` / `running` / `completed` / `failed` の状態を返す。
  - `completed` の場合は各画像を基準preview座標系へ写す `transforms[]` と `warnings[]` を返す。
- `POST /api/jobs`
  - サーバー側preview合成の比較・フォールバック用。JSON の `sessionId` と `baseImageIndex` を受け取り、preview upload セッション内のファイルを名前順で Rust worker に渡す。
  - `previewPaths` を明示する場合も、対象セッションディレクトリ配下のパスだけを受け付ける。
- `GET /api/jobs/:jobID`
  - Go API プロセス内メモリで管理している `queued` / `running` / `completed` / `failed` の状態を返す。
- `GET /api/jobs/:jobID/result`
  - `completed` の場合のみ結果 JPEG を返す。

Web UI は preview JPEG の準備完了後、自動で preview JPEG をアップロードし、`POST /api/preview-alignments` を呼び出して変換行列推定ジョブを作成し、`GET /api/preview-alignments/:alignmentJobID` を polling して完了後に変換行列を取得し、ブラウザ側で preview JPEG をスタックする。preview 合成結果は Blob URL として画面プレビュー、別タブ表示、PNG ダウンロードリンクに使うため、通常フローではサーバーに合成 PNG を保存しない。RAW 現像と元画像合成の結果は、画面表示用 PNG preview と、ユーザーが選択した TIFF / PNG / JPEG のダウンロードリンクに分ける。warning が返った場合は `TRANSFORM_ESTIMATE_FAILED` などの code と message を Execution パネルに表示する。RAW 現像と元画像合成はユーザーが preview 結果を確認した後の明示操作でのみ開始する。`POST /api/jobs` と `GET /api/jobs/:jobID/result` はサーバー側合成の比較・フォールバック用として残す。

アップロード済み preview JPEG と `.data/jobs/<job-id>/` の fallback 結果は、Go API の cleanup worker が標準 24 時間 TTL で削除する。`STELLA_COMP_CLEANUP_TTL` と `STELLA_COMP_CLEANUP_INTERVAL` で変更でき、`0` または負値なら cleanup を無効化する。`queued` / `running` のジョブ、または TTL 内の完了済みジョブが参照する preview session は削除しない。

Rust 側には preview JPEG の調査用 example として以下を置く。

- `cargo run -p stellacomp --example match_diagnostics -- <base-image> <target-image>...`
  - 基準画像と各対象画像の特徴点数、採用マッチ数を表示する。
- `cargo run -p stellacomp --example align_and_average -- <output-path> <input-image>...`
  - Rust core 単体で preview JPEG の位置合わせ・加算平均を実行する。

## 主要な未決定事項

- Rust worker のプロセス管理方式: ローカル同居プロセス、Docker Compose、または将来の独立デプロイ
- ジョブ永続化方式: Valkey の Redis 互換データ構造から開始し、監査や履歴が必要になった段階で PostgreSQL などの永続 DB を併用するか
- 画像保存先: ローカルファイルシステムから開始するか、S3 互換ストレージを前提にするか
- RAW 現像パラメータの扱い
- プレビュー画像の生成方式と最大サイズ
- `libraw-wasm` の成熟度とライセンス運用。npm package は ISC 表記だが、同梱される LibRaw 本体は LGPL/CDDL 条件を確認し、配布時のライセンス表示・ソース提供・差し替え可能性を整理する。
