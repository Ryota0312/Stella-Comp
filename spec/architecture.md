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
- CR3 の埋め込みプレビュー抽出フォールバック
- 基準画像と処理設定の入力
- 低解像度の位置合わせプレビュー表示
- ブラウザ Canvas/Worker による preview 合成と将来の元画像合成
- ジョブ状態の表示
- 処理結果のプレビューとダウンロード

### apps/api

- REST API
- アップロードファイルの受け取り
- 元画像と軽量プレビュー画像の対応関係管理
- ジョブ作成と状態管理
- Rust worker への gRPC 呼び出し
- 成果物の配信
- 将来のサーバー処理オプションや有料処理の入口

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

フロントエンドは `NEXT_PUBLIC_API_BASE_URL` で API base URL を切り替える。未指定時は `http://localhost:8080/api` を使う。nginx 経由では `/api` を指定する。

将来の docker-compose 構成では nginx を前段に置き、同一オリジンでルーティングする。

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

初期 Web 実装では、ブラウザで直接デコードできる JPEG/PNG/WebP/AVIF から軽量 JPEG を生成する。RAW は D&D 直後には重い現像をせず、Web Worker でファイル内の JPEG SOI/EOI marker を走査し、最大の埋め込み JPEG 候補を抽出して preview JPEG 生成に使う。preview JPEG のアップロード、位置合わせ推定、preview 合成は D&D 後に自動実行する。ユーザーが preview 合成結果を確認した後、明示操作で `libraw-wasm` のブラウザ側現像を実行し、現像できた RGB 画像を元画像合成に使う。RAW 現像と元画像合成中は、処理中フレーム数ベースの進捗を表示する。埋め込み preview を抽出できない RAW は、現時点では `RAW pending` として扱う。

注意すべき座標変換:

- 元画像からプレビュー画像への縮小率
- EXIF orientation
- RAW 現像時の回転やクロップ
- JPEG プレビュー生成時のリサイズ方式

現在のハイブリッド PoC では、Rust worker が preview JPEG から基準画像への 2x3 アフィン変換行列を推定し、Web UI がその行列を使ってブラウザ上で preview JPEG をアフィン変換・加算平均合成する。重いピクセル処理をブラウザ側へ寄せ、サーバーは位置合わせ推定を担当する構成の成立性を検証する。

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

現在の Web UI は preview JPEG の準備完了後に自動で `POST /api/preview-alignments` で変換行列推定ジョブを作成し、`GET /api/preview-alignments/:alignmentJobID` を polling する。完了後は Rust worker の `EstimateTransforms` が返した変換行列でブラウザ側 preview 合成を行う。preview 合成は確認・共有用の PNG として扱う。RAW/TIFF 現像と元画像合成は preview 結果をユーザーが確認した後の明示操作で開始し、処理中は進捗を表示する。本処理成果物は Lightroom などで後処理する前提の TIFF とし、画面確認用には別途 PNG preview を生成する。`POST /api/jobs` は引き続き Go API がジョブをプロセス内メモリで管理し、Rust worker の `AlignAndAverage` で `.data/jobs/<job-id>/result.jpg` を生成する比較・フォールバック用エンドポイントとして残す。ジョブ永続化は後続で拡張する。

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
