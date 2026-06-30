# Architecture

## 推奨構成

初期実装はモノレポで開始する。

```text
stella-comp/
  apps/
    api/          # Go + gin, gRPC client
    web/          # TypeScript + Next.js
  crates/
    stellacomp/   # Rust image processing core
    worker/       # Rust gRPC server
  proto/
    stellacomp/v1/
  spec/
```

## コンポーネント責務

### apps/web

- 画像アップロード UI
- 軽量プレビュー画像の生成
- RAW ファイルの受け付けとブラウザ WASM による RAW 現像
- RAW ファイル内の埋め込み JPEG プレビュー抽出フォールバック
- 基準画像と処理設定の入力
- 低解像度の位置合わせプレビュー表示
- ブラウザ Canvas/Worker による preview 合成と将来の元画像合成
- ジョブ状態の表示
- 処理結果のプレビューとダウンロード

フロントエンドの feature は URL や一時的な画面フェーズではなく、業務上のまとまりで分ける。現在の星景写真合成フローは `apps/web/src/features/stacking` を正とし、アップロード、プレビュー合成、本画像合成は同 feature 内の状態遷移として扱う。feature 内は `components/`、`hooks/`、`api/`、`processing/`、`model/` に分ける。フェーズ単位のディレクトリは、専用 UI とロジックが十分に独立してから追加する。UI 固有 CSS は `app/globals.css` に置かず feature 近くの CSS Modules に置く。`app/globals.css` はデザイントークン、reset、アプリ全体の最低限の base style に限定する。

`features/stacking` のワークフロー状態は、アプリ全体の global store ではなく feature-local な Zustand store と provider で扱う。`StackingWorkspace` はレイアウトとステップ分岐に寄せ、言語、現在ステップ、位置合わせ方式、変換モデル、書き出し形式、キュー、preview upload、合成ジョブ状態は feature 内の context/hook から必要なコンポーネントが読む。等倍確認のカーソル位置や表示モードなど、単一コンポーネントで完結する表示状態は local state のまま保持する。

### apps/api

- REST API
- アップロードファイルの受け取り
- 元画像と軽量プレビュー画像の対応関係管理
- ジョブ作成と状態管理
- Rust worker への gRPC 呼び出し
- 成果物の配信
- 将来のサーバー処理オプションや有料処理の入口

Go API は `cmd/api` を起動と依存注入だけに絞り、実装は `internal/` 配下のレイヤーに分ける。

- `internal/transport/http`: gin に依存するプレゼンテーション層。HTTP request/response、status code、multipart/JSON binding、CORS を扱う。
- `internal/usecase`: アプリケーションのユースケース層。preview upload セッションからの合成ジョブ作成、位置合わせ推定ジョブ作成、ジョブ状態遷移、Protocol Buffers 型への変換を扱う。ジョブ状態は現時点ではプロセス内メモリ store を使う。
- `internal/service`: HTTP や gRPC に依存しないサービス層。preview file の保存、セッションディレクトリ内パス検証、ファイル名・セッションIDの正規化などを扱う。
- `internal/processor`: Rust worker への gRPC adapter。`usecase.Processor` interface の実装として外部画像処理境界を担当する。
- `internal/gen`: `proto/` から生成した Go code。Go/Rust 間の契約型として扱い、手編集しない。

HTTP 層から直接 gRPC client やファイルシステム詳細を呼ばず、`usecase` と `service` を経由する。将来 Valkey にジョブ状態を移す場合は、`internal/usecase` の store 実装を差し替える。

### crates/stellacomp

- RAW/TIFF 読み込み
- 星または特徴点の検出
- 画像間マッチング
- 変換行列の推定
- プレビュー画像座標系から元画像座標系への変換行列補正
- 画像ワープ
- 加算平均合成

### crates/worker

- gRPC server
- Protocol Buffers で定義された処理 API の実装
- `crates/stellacomp` の呼び出し
- 画像処理の進捗、警告、エラーの返却

### proto

- Go/Rust 間の RPC 契約
- 生成コードの入力元
- リクエスト、レスポンス、エラー、警告、ジョブ状態の型定義

## 処理分担

初期実装では、サーバー負荷を避けるため、RAW 現像と合成などの重いピクセル処理は可能な範囲でブラウザ側に寄せる。Rust worker は preview JPEG からの位置合わせ推定、比較用のサーバー合成、将来の有料/高品質サーバー処理候補として gRPC server の形で残す。

理由:

- preview JPEG の特徴点検出と変換行列推定は現時点で Rust/OpenCV 実装があるため、短期的には worker を使う
- RAW 現像や元画像合成をクライアントへ寄せることで、無料/通常利用時のサーバーCPU負荷とアップロード容量を抑えられる
- サーバー処理を残しておくと、将来的に高品質処理、長時間処理、端末性能が足りないユーザー向けの課金オプションにしやすい
- Go/Rust 間の API 境界を Protocol Buffers で明確にできる
- HTTP API と画像処理 API の責務を分離できる
- 進捗、警告、エラー、キャンセルなどを型付きで拡張しやすい

大きい画像データは gRPC メッセージ本体には載せない。初期は preview JPEG を共有ローカルディレクトリ上のファイルパスとして渡し、将来のサーバー処理では S3 互換ストレージなどの URI に置き換えられるようにする。

## HTTP ルーティング

ローカル開発では Next.js と Go API を別ポートで起動する。

- Next.js: `http://localhost:3000`
- Go API: `http://localhost:8080`

フロントエンドは `NEXT_PUBLIC_API_BASE_URL` で API base URL を切り替える。未指定時は `http://localhost:8080/api` を使う。Docker Compose の HTTPS Portal / nginx 経由では `/api` を指定する。

Docker Compose 構成では HTTPS Portal を外部公開口と TLS 終端に使い、その内側の nginx で同一オリジンにルーティングする。詳細は `spec/deployment.md` を参照する。

```text
/      -> Next.js
/api/  -> Go API
```

API エンドポイントは `/api/*` 配下に固定する。大容量アップロードを扱うため、nginx ではアップロードサイズ、request buffering、proxy timeout を明示する。

## 画像処理パイプライン

初期実装では、位置合わせと最終合成で使う画像を分ける。

- 位置合わせ: ブラウザまたはサーバで生成した軽量プレビュー画像を使う
- preview PoC 合成: 推定した変換行列をブラウザの Canvas で preview JPEG に適用し、クライアント側で加算平均合成する
- 最終変換: 推定した変換行列を元画像座標系へ補正して使う
- 将来の最終合成: RAW/TIFF などの元画像をまずブラウザ WASM/Canvas/Worker で処理する。Rust worker は比較用またはサーバー処理オプションとして残す
- UI プレビュー: 低解像度画像に変換行列を適用して表示する

この構成により、特徴点検出とマッチングの負荷を下げつつ、最終成果物の画質は元画像ベースで維持する。

初期 Web 実装では、ブラウザで直接デコードできる JPEG/PNG/WebP/AVIF から軽量 JPEG を生成する。RAW は D&D 直後には重い現像をせず、Web Worker でファイル内の JPEG SOI/EOI marker を走査し、最大の埋め込み JPEG 候補を抽出して preview JPEG 生成に使う。この抽出は RAW コンテナやメーカー固有メタデータを解析しない best-effort fallback であり、CR2/CR3/DNG/NEF/ARW/RAF/ORF/RW2 などすべての RAW で成功を保証するものではない。preview JPEG のアップロード、位置合わせ推定、preview 合成は D&D 後に自動実行する。ユーザーが preview 合成結果を確認して本画像合成ステップへ進んだ時点で、`libraw-wasm` のブラウザ側現像を実行し、現像できた RGB 画像を元画像合成に使う。RAW 現像と元画像合成中は、通常 UI では百分率の進捗を表示し、内部ステップ数ベースの進捗は staging debug に限定して表示する。本画像合成ステップ内の実行ボタンは再実行や将来のオプション変更後の実行操作として残す。埋め込み preview を抽出できない RAW は、現時点では `RAW pending` として扱う。

RAW プレビュー抽出の中長期方針:

- 第一候補は LibRaw の thumbnail extraction 相当を利用できるようにすること。現在利用している `libraw-wasm` は現像済み `imageData()` 中心の API で、サムネイル抽出 API が公開されていないため、fork/拡張または別 WASM wrapper を検討する。
- 堅牢性を優先する場合は、preview 抽出だけを Go API または Rust worker 側のサーバー処理へ逃がし、LibRaw、ExifTool、exiv2 など実績のあるライブラリで抽出する。ただし通常フローの元画像アップロード量とサーバー負荷が増えるため、個人検証段階では opt-in または fallback として扱う。
- DNG は TIFF/IFD 系の公開仕様に寄せて比較的正攻法で扱えるため、DNG の thumbnail/preview IFD 解析を先に追加し、メーカー独自 RAW は LibRaw 系へ寄せる案を検討する。
- 実機 RAW サンプルを形式別に追加し、埋め込み JPEG 抽出成功、`libraw-wasm` 現像成功、preview 座標と本画像座標の対応を回帰テスト化する。

注意すべき座標変換:

- 元画像からプレビュー画像への縮小率
- EXIF orientation
- RAW 現像時の回転やクロップ
- JPEG プレビュー生成時のリサイズ方式

現在のハイブリッド PoC では、Rust worker が preview JPEG から基準画像への変換行列を推定し、Web UI がその行列を使ってブラウザ上で preview JPEG を変換・加算平均合成する。標準の変換モデルは `homography` とする。重いピクセル処理をブラウザ側へ寄せ、サーバーは位置合わせ推定を担当する構成の成立性を検証する。

位置合わせ改善は `spec/alignment-roadmap.md` を正とする。現在は `stars + homography` を標準とし、アフィンは互換・比較用として残す。将来的には検出手法と変換モデルを分離し、`AlignmentEstimator` として affine、homography、mesh warp、TPS、spherical model を切り替えられる構成にする。

## 初期 API 案

- `GET /api/health`
  - Go API のヘルスチェック。
- `POST /api/preview-uploads`
  - ブラウザで生成した preview JPEG を受け取り、ローカルファイルシステムに保存する。
- `POST /api/preview-alignments`
  - `sessionId` と `baseImageIndex` を受け取り、preview upload セッション内のファイルから各画像の preview 座標系アフィン変換行列を推定する非同期ジョブを作成する。
- `GET /api/preview-alignments/:alignmentJobID`
  - 変換行列推定ジョブの状態を返す。完了時は各画像の preview 座標系アフィン変換行列を返す。
- `POST /api/jobs`
  - サーバー合成の比較・フォールバック用。`sessionId` と `baseImageIndex` を受け取り、preview upload セッション内のファイルからジョブを作成する。
  - 必要に応じて `previewPaths` を明示できるが、パスは `.data/uploads/previews/<session-id>/` 配下に制限する。
- `GET /api/jobs/:jobID`
  - ジョブ状態、進捗、エラーを返す。
- `GET /api/jobs/:jobID/result`
  - 完了済みジョブの成果物を返す。

現在の Web UI は preview JPEG の準備完了後に自動で `POST /api/preview-alignments` で変換行列推定ジョブを作成し、`GET /api/preview-alignments/:alignmentJobID` を polling する。完了後は Rust worker の `EstimateTransforms` が返した変換行列でブラウザ側 preview 合成を行う。preview 合成は確認・共有用の PNG として扱い、Blob URL で表示・ダウンロードするため、通常フローではサーバーに保存しない。結果確認 UI は、合成 PNG と選択された基準フレームの preview JPEG の切替/左右比較、およびカーソル位置の基準/合成ピクセル等倍クロップ表示をクライアント側だけで行う。RAW/TIFF 現像と元画像合成は preview 結果をユーザーが確認して本画像合成ステップへ進んだ時点で開始し、処理中は右ペインの画像領域オーバーレイに状態と進捗を表示する。本処理成果物は Lightroom などで後処理する前提の TIFF とし、画面確認用には別途 PNG preview を生成する。本画像合成ステップ内の実行ボタンは再実行および将来のオプション変更後の実行用として残す。`POST /api/jobs` は引き続き Go API がジョブをプロセス内メモリで管理し、Rust worker の `AlignAndAverage` で `.data/jobs/<job-id>/result.jpg` を生成する比較・フォールバック用エンドポイントとして残す。アップロード済み preview JPEG と fallback 結果は標準 24 時間 TTL の cleanup 対象で、TTL と実行間隔は `STELLA_COMP_CLEANUP_TTL` / `STELLA_COMP_CLEANUP_INTERVAL` で変更する。ジョブ永続化は後続で拡張する。

左ペインはフェーズごとの最小操作に絞る。アップロードフェーズではドロップエリア、基準フレーム、位置合わせ方式、変換モデル、選択済みフレーム一覧を表示する。プレビュー合成フェーズでは位置合わせ方式、変換モデル、フレーム数、書き出し形式選択を表示する。本画像合成フェーズでは位置合わせ方式、変換モデル、フレーム数、書き出し形式を読み取り表示する。次フェーズへ進む CTA と戻る操作は、画像上に重ねず、左ペイン下部の固定アクション領域に置く。

## 初期 gRPC API 案

```proto
syntax = "proto3";

package stellacomp.v1;

service ImageProcessor {
  rpc AlignAndAverage(AlignAndAverageRequest) returns (AlignAndAverageResponse);
  rpc EstimateTransforms(EstimateTransformsRequest) returns (EstimateTransformsResponse);
}

message AlignAndAverageRequest {
  repeated InputImage images = 1;
  string output_path = 2;
  int32 base_image_index = 3;
}

message InputImage {
  string source_path = 1;
  string preview_path = 2;
  ImageSize source_size = 3;
  ImageSize preview_size = 4;
}

message AlignAndAverageResponse {
  string output_path = 1;
  repeated ProcessingWarning warnings = 2;
}

message EstimateTransformsRequest {
  repeated InputImage images = 1;
  int32 base_image_index = 2;
}

message EstimateTransformsResponse {
  repeated ImageTransform transforms = 1;
  repeated ProcessingWarning warnings = 2;
}

message ImageTransform {
  uint32 image_index = 1;
  repeated double affine = 2;
  bool estimated = 3;
}

message ProcessingWarning {
  string code = 1;
  string message = 2;
}

message ImageSize {
  uint32 width = 1;
  uint32 height = 2;
}
```

ジョブ管理は当面 Go API 側で担当する。Rust worker は同期的な画像処理 RPC から開始し、必要になった段階で server streaming または worker 内ジョブ API を追加する。

## デプロイとジョブキュー

Docker Compose では `https-portal`、`nginx`、`web`、`api`、`worker`、`valkey` を起動する。`https-portal` が TLS 終端を担当し、`nginx` が `/` と `/api/` を内部サービスへ振り分ける。Go API と Rust worker は同じ `stella-data` volume を `/data` に mount し、API が保存した preview JPEG や server-side result を worker から同じ絶対パスで参照できるようにする。

ジョブキュー基盤は Redis 互換の Valkey を標準候補にする。Redis 互換 ecosystem を使えるため Go API から扱いやすく、単一 VPS の Compose 運用から managed Redis 互換サービスへ移しやすい。MVP の現在実装は Go API プロセス内メモリで `queued` / `running` / `completed` / `failed` を管理しているため、Compose の Valkey は次段階の queue backend として同居させる。API 複数 replica 化、再起動耐性、retry、timeout、cancel を入れる段階では、queue だけでなく polling 用 job state も Valkey へ移す。

## MVP の実装順

1. `proto/stellacomp/v1/processor.proto` を作成する。
2. `crates/stellacomp` に既存 Rust ライブラリを移植する。
3. `crates/worker` に Rust gRPC server を作り、軽量プレビュー画像からの `AlignAndAverage` を実装する。
4. Go API で軽量プレビュー画像のアップロード、ジョブ作成、gRPC 呼び出し、結果取得を実装する。
5. Next.js でアップロード、軽量プレビュー生成、状態表示、低解像度プレビュー、結果ダウンロードの画面を実装する。
6. サンプル CR3/TIFF を使った回帰テストを追加する。

## 注意点

- 既存 `hoshikasane` の `average` は2枚ずつ平均しているため、3枚以上では厳密な算術平均にならない。MVP 取り込み時に累積和ベースへ修正する。
- 既存 `hoshikasane` の `convert_to_dynamic_image` は拡張子の大文字小文字や `tif` を十分に扱っていない。Web入力では正規化とバリデーションを追加する。
- OpenCV 依存はローカル環境差が出やすいので、早い段階で devcontainer またはセットアップ手順を固定する。
- ローカル開発では Go API と Rust worker の2プロセスを起動する必要がある。起動手順は mise task または Makefile にまとめる。
- プレビュー画像だけで推定した変換行列が元画像に正しく適用できるよう、サイズと回転情報を必ず保存する。
