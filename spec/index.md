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
- 星位置合わせ、特徴点検出、アフィン変換、合成は Rust で実装する。
- Go API と Rust worker の境界は gRPC/Protocol Buffers で定義する。
- ツールバージョンは mise で固定する。

## 画像処理方針

最終成果物の画質を維持するため、RAW/TIFF などの元画像はサーバサイドで処理する。

一方で、星の位置合わせに使う変換行列の推定は、元画像より軽いプレビュー画像を使って高速化する。ブラウザは可能であればアップロード前に軽量 JPEG または縮小画像を生成し、元画像と合わせてサーバへ送信する。

初期の Web 実装では、RAW ファイルも D&D の入力として受け付ける。ただし、ブラウザ標準 API では CR2/CR3 を直接デコードできる前提にしない。最初は JPEG/PNG/WebP/AVIF などブラウザで読める画像から軽量 JPEG を生成する。CR3 はファイル内の埋め込み JPEG 候補を Web Worker で抽出し、抽出できた JPEG を軽量プレビュー生成に使う。

初期処理フロー:

1. ブラウザで元画像を選択する。
2. ブラウザで軽量プレビュー画像を生成する。ブラウザで直接読めない RAW は、後続の埋め込みプレビュー抽出処理へ回す。
3. Go API に元画像と軽量プレビュー画像をアップロードする。
4. Rust worker が軽量プレビュー画像からアフィン変換行列を推定する。
5. Rust worker が推定した変換行列を元画像座標系へ変換する。
6. Rust worker が元画像に変換行列を適用し、加算平均合成する。
7. Go API が処理結果と位置合わせプレビューを返す。

MVP の現在実装では、preview JPEG のアップロード後に `POST /api/jobs` でジョブを作成し、Go API が Rust worker の `AlignAndAverage` を呼び出す。現段階では preview JPEG を位置合わせ入力兼合成入力として扱い、結果 JPEG を `.data/jobs/<job-id>/result.jpg` に保存する。Go API は `STELLA_COMP_DATA_DIR` を起動時に絶対パスへ正規化し、worker へ絶対パスを渡す。元画像への変換行列適用、RAW/TIFF 現像、ジョブ永続化は後続で実装する。

preview JPEG の位置合わせは AKAZE 特徴点を使い、短時間の星景フレームに合わせて回転・平行移動・等方スケールの部分アフィン変換を推定する。MVP では、RANSAC で妥当な変換を推定できないフレームは `ALIGNMENT_SKIPPED` warning を付けて合成対象から外し、ジョブ全体は可能な限り完了させる。これは結果ファイル確認を優先するための暫定挙動であり、後続で星検出ベースのマッチングやより安定した変換推定へ置き換える。

ブラウザ側でのアフィン変換行列の適用は、初期 MVP では最終成果物ではなく低解像度プレビュー用途に限定する。最終画像への変換行列適用と合成は Rust worker で行う。

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

新規プロジェクトでは、この処理を Rust worker として取り込み、Go API から gRPC でジョブ単位に呼び出す。位置合わせは軽量プレビュー画像、最終変換と合成は元画像を使う構成へ拡張する。

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
- `POST /api/jobs`
  - JSON の `sessionId` と `baseImageIndex` を受け取り、preview upload セッション内のファイルを名前順で Rust worker に渡す。
  - `previewPaths` を明示する場合も、対象セッションディレクトリ配下のパスだけを受け付ける。
- `GET /api/jobs/:jobID`
  - Go API プロセス内メモリで管理している `queued` / `running` / `completed` / `failed` の状態を返す。
- `GET /api/jobs/:jobID/result`
  - `completed` の場合のみ結果 JPEG を返す。

Web UI は preview JPEG のアップロード後、同じ画面から `POST /api/jobs` を呼び出して合成ジョブを作成できる。ジョブ作成後は `GET /api/jobs/:jobID` を約2.5秒間隔で polling し、`completed` になったら `GET /api/jobs/:jobID/result` を画像プレビュー、別タブ表示、ダウンロードリンクに使う。ジョブが `failed` の場合は API の error を画面に表示し、warning が返った場合は `ALIGNMENT_SKIPPED` などの code と message を Execution パネルに表示する。

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
