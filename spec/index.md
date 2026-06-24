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

星景写真を扱う作業画面として、MVP の Web UI は黒基調のダークテーマを標準にする。背景とパネルは黒からチャコールの低彩度色を使い、主要操作と選択状態はシアン系アクセントで識別する。プレビュー画像や合成結果の視認性を優先し、入力、キュー、進捗、警告、エラーは暗色背景上で十分なコントラストを確保する。

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

## 画像処理方針

サーバー負荷を抑えるため、RAW/TIFF などの元画像処理は可能な限りクライアントサイドで実行する。ブラウザ WASM/Worker/Canvas で RAW 現像、変換行列適用、加算平均合成が成立するかを優先して検証する。

星の位置合わせに使う変換行列の推定は、元画像より軽いプレビュー画像を使って高速化する。ブラウザはアップロード前に軽量 JPEG または縮小画像を生成し、当面は preview JPEG だけをサーバへ送信する。元画像は原則としてブラウザ内に保持し、将来のサーバー処理オプションでは明示的にアップロードする。

初期の Web 実装では、RAW ファイルも D&D の入力として受け付ける。ただし、ブラウザ標準 API では CR2/CR3 を直接デコードできる前提にしない。プロトタイプでは `libraw-wasm` を使い、RAW 本体をブラウザ側 WebAssembly/Worker で現像して軽量 JPEG preview を生成できるか検証する。CR3 は `libraw-wasm` 現像に失敗した場合のみ、ファイル内の埋め込み JPEG 候補を既存 Web Worker で抽出してフォールバックする。

初期処理フロー:

1. ブラウザで元画像を選択する。
2. ブラウザで軽量プレビュー画像を生成する。RAW は `libraw-wasm` によるブラウザ側現像を試し、失敗した CR3 は埋め込みプレビュー抽出へ回す。
3. Go API に軽量プレビュー画像をアップロードする。
4. Rust worker が軽量プレビュー画像からアフィン変換行列を推定する。
5. Go API が推定した変換行列を Web UI へ返す。
6. Web UI がブラウザ上で preview JPEG に変換行列を適用し、加算平均合成する。
7. Web UI が処理結果を PNG としてプレビュー、ダウンロードできるようにする。

MVP の現在実装では、preview JPEG のアップロード後に Web UI が `POST /api/preview-alignments` で非同期ジョブを作成し、Go API が Rust worker の `EstimateTransforms` から各画像の 2x3 アフィン変換行列を取得する。Web UI は `GET /api/preview-alignments/:alignmentJobID` を polling し、完了後に返却された行列を使ってブラウザの Canvas 上で preview JPEG を変換し、加算平均した PNG を生成する。`POST /api/jobs` は従来のサーバー側 preview JPEG 合成の比較・フォールバック用として残す。Go API は `STELLA_COMP_DATA_DIR` を起動時に絶対パスへ正規化し、worker へ絶対パスを渡す。元画像への変換行列適用、RAW/TIFF 現像、ジョブ永続化は後続で実装する。

preview JPEG の位置合わせは AKAZE 特徴点を使い、短時間の星景フレームに合わせて回転・平行移動・等方スケールの部分アフィン変換を推定する。MVP では、RANSAC で妥当な変換を推定できないフレームは `TRANSFORM_ESTIMATE_FAILED` warning を付けて identity transform を返し、クライアント側合成全体は可能な限り完了させる。これは結果ファイル確認を優先するための暫定挙動であり、後続で星検出ベースのマッチングやより安定した変換推定へ置き換える。

ブラウザ側でのアフィン変換行列の適用は、まず preview JPEG の PoC 合成で検証する。最終的な RAW/TIFF 合成では、preview 座標系の変換行列を元画像座標系へ補正し、まずブラウザ WASM で重いピクセル処理を担えるかを実測する。サーバー負荷を避けるため、プロトタイプでは RAW 現像もブラウザ側で試す。

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

Web UI は preview JPEG のアップロード後、同じ画面から `POST /api/preview-alignments` を呼び出して変換行列推定ジョブを作成し、`GET /api/preview-alignments/:alignmentJobID` を polling して完了後に変換行列を取得し、ブラウザ側で preview JPEG をスタックする。結果は Blob URL として画面プレビュー、別タブ表示、PNG ダウンロードリンクに使う。warning が返った場合は `TRANSFORM_ESTIMATE_FAILED` などの code と message を Execution パネルに表示する。`POST /api/jobs` と `GET /api/jobs/:jobID/result` はサーバー側合成の比較・フォールバック用として残す。

Rust 側には preview JPEG の調査用 example として以下を置く。

- `cargo run -p stellacomp --example match_diagnostics -- <base-image> <target-image>...`
  - 基準画像と各対象画像の特徴点数、採用マッチ数を表示する。
- `cargo run -p stellacomp --example align_and_average -- <output-path> <input-image>...`
  - Rust core 単体で preview JPEG の位置合わせ・加算平均を実行する。

## 主要な未決定事項

- Rust worker のプロセス管理方式: ローカル同居プロセス、Docker Compose、または将来の独立デプロイ
- ジョブ永続化方式: SQLite から開始するか、最初から PostgreSQL を使うか
- 画像保存先: ローカルファイルシステムから開始するか、S3 互換ストレージを前提にするか
- RAW 現像パラメータの扱い
- プレビュー画像の生成方式と最大サイズ
- `libraw-wasm` の成熟度とライセンス運用。npm package は ISC 表記だが、同梱される LibRaw 本体は LGPL/CDDL 条件を確認し、配布時のライセンス表示・ソース提供・差し替え可能性を整理する。
