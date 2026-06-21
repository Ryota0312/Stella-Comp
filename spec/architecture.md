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
- 基準画像と処理設定の入力
- ジョブ状態の表示
- 処理結果のプレビューとダウンロード

### apps/api

- REST API
- アップロードファイルの受け取り
- ジョブ作成と状態管理
- Rust worker への gRPC 呼び出し
- 成果物の配信

### crates/stellacomp

- RAW/TIFF 読み込み
- 星または特徴点の検出
- 画像間マッチング
- 変換行列の推定
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

## Rust 呼び出し方式

初期実装から Rust worker を gRPC server として起動し、Go API から gRPC client で呼び出す。

理由:

- 数値計算・画像処理部分を将来的に独立サービスとして運用しやすい
- Go/Rust 間の API 境界を Protocol Buffers で明確にできる
- HTTP API と画像処理 API の責務を分離できる
- 進捗、警告、エラー、キャンセルなどを型付きで拡張しやすい
- OpenCV や rawler の依存関係を Rust worker 側に閉じ込めやすい

大きい画像データは gRPC メッセージ本体には載せない。初期は共有ローカルディレクトリ上のファイルパスを渡し、将来は S3 互換ストレージなどの URI に置き換えられるようにする。

## 初期 API 案

- `POST /api/jobs`
  - 複数画像と処理設定を受け取り、ジョブを作成する。
- `GET /api/jobs/:jobID`
  - ジョブ状態、進捗、エラーを返す。
- `GET /api/jobs/:jobID/result`
  - 完了済みジョブの成果物を返す。

## 初期 gRPC API 案

```proto
syntax = "proto3";

package stellacomp.v1;

service ImageProcessor {
  rpc AlignAndAverage(AlignAndAverageRequest) returns (AlignAndAverageResponse);
}

message AlignAndAverageRequest {
  repeated string input_paths = 1;
  string output_path = 2;
  int32 base_image_index = 3;
}

message AlignAndAverageResponse {
  string output_path = 1;
  repeated ProcessingWarning warnings = 2;
}

message ProcessingWarning {
  string code = 1;
  string message = 2;
}
```

ジョブ管理は当面 Go API 側で担当する。Rust worker は同期的な画像処理 RPC から開始し、必要になった段階で server streaming または worker 内ジョブ API を追加する。

## MVP の実装順

1. `proto/stellacomp/v1/processor.proto` を作成する。
2. `crates/stellacomp` に既存 Rust ライブラリを移植する。
3. `crates/worker` に Rust gRPC server を作り、`AlignAndAverage` を実装する。
4. Go API でアップロード、ジョブ作成、gRPC 呼び出し、結果取得を実装する。
5. Next.js でアップロード、状態表示、結果ダウンロードの画面を実装する。
6. サンプル CR3/TIFF を使った回帰テストを追加する。

## 注意点

- 既存 `hoshikasane` の `average` は2枚ずつ平均しているため、3枚以上では厳密な算術平均にならない。MVP 取り込み時に累積和ベースへ修正する。
- 既存 `hoshikasane` の `convert_to_dynamic_image` は拡張子の大文字小文字や `tif` を十分に扱っていない。Web入力では正規化とバリデーションを追加する。
- OpenCV 依存はローカル環境差が出やすいので、早い段階で devcontainer またはセットアップ手順を固定する。
- ローカル開発では Go API と Rust worker の2プロセスを起動する必要がある。起動手順は mise task または Makefile にまとめる。
