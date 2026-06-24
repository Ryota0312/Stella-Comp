# Stella Comp

星景写真の合成・レタッチを行う Web アプリケーションです。

## セットアップ

このリポジトリではツールバージョンを mise で管理します。JavaScript / pnpm 関連の管理ファイルは `apps/web` 配下に寄せています。

Rust の画像処理コアは OpenCV に依存します。Rust workspace をチェックまたは worker を起動する前に、`pkg-config` から `opencv4` を検出できるようにしてください。

```sh
mise install
cd apps/web
mise exec -- pnpm install
```

## Web アプリの起動

開発サーバーはユーザー側で起動してください。Codex は原則として dev server を起動しません。

Go API:

```sh
cd apps/api
GOCACHE=$PWD/.gocache GOMODCACHE=$PWD/.gomodcache mise exec -- go run ./cmd/api
```

Go API は標準で `http://localhost:8080` を使います。

Rust worker:

```sh
mise exec -- cargo run -p worker
```

Rust worker は標準で `[::1]:50051` を使います。変更する場合は `STELLA_COMP_WORKER_ADDR` を指定してください。

Next.js:

```sh
cd apps/web
mise exec -- pnpm dev
```

Next.js は標準で `http://localhost:3000` を使います。フロントエンドは標準で `http://localhost:8080/api` の Go API に preview JPEG をアップロードします。本番または nginx 経由では `NEXT_PUBLIC_API_BASE_URL=/api` を想定します。

ポートを指定する場合:

```sh
cd apps/web
mise exec -- pnpm dev --hostname 127.0.0.1 --port 3001
```

IntelliJ から起動する場合は、共有 Run Configuration の `Web Dev`、`API Dev`、`image proc worker` を使ってください。`Web Dev` は `apps/web/package.json` の `dev` を、`mise exec -- which pnpm` で確認できる `pnpm` 実体パスで起動する設定にしています。`API Dev` は Go Application として `apps/api/cmd/api` パッケージを起動します。`image proc worker` は Cargo Command として workspace ルートで `cargo run -p worker` を実行します。Go SDK と Rust toolchain は mise で入れたものを IntelliJ 側に設定してください。Rust toolchain location は `cargo`/`rustc` が直接置かれている `bin` ディレクトリ、たとえば `~/.rustup/toolchains/1.96.0-x86_64-unknown-linux-gnu/bin` を指定します。

## エンドポイント方針

ローカル開発では Next.js と Go API を別ポートで起動します。

```text
http://localhost:3000  Next.js
http://localhost:8080  Go API
```

将来的には docker-compose で nginx, Next.js, Go API, Rust worker を立て、nginx で同一オリジンにまとめます。

```text
/      -> Next.js
/api/  -> Go API
```

Go API の初期エンドポイント:

```text
GET  /api/health
POST /api/preview-uploads
POST /api/preview-alignments
GET  /api/preview-alignments/:alignmentJobID
POST /api/jobs
GET  /api/jobs/:jobID
GET  /api/jobs/:jobID/result
```

`POST /api/preview-uploads` は preview JPEG を `multipart/form-data` の `previews` フィールドで受け取り、`.data/uploads/previews/<session-id>/` に保存します。

`POST /api/preview-alignments` は preview upload の `sessionId` と `baseImageIndex` を JSON で受け取り、`.data/uploads/previews/<session-id>/` の preview JPEG を Rust worker の `EstimateTransforms` へ渡す非同期ジョブを作成します。レスポンスは `202 Accepted` と `alignmentJobId` です。`GET /api/preview-alignments/:alignmentJobID` は `queued` / `running` / `completed` / `failed` の状態を返し、完了時は各画像を基準preview座標系へ写す 2x3 アフィン変換行列を返します。Web UI はこの行列を使い、ブラウザの Canvas 上で preview JPEG をアフィン変換して加算平均合成し、PNG を生成します。

`POST /api/jobs` は従来のサーバー合成用エンドポイントとして残しています。preview upload の `sessionId` と `baseImageIndex` を JSON で受け取り、Rust worker の `AlignAndAverage` で preview JPEG をそのまま位置合わせ・加算平均合成し、結果を `.data/jobs/<job-id>/result.jpg` に保存します。Go API は `STELLA_COMP_DATA_DIR` を起動時に絶対パスへ正規化し、その絶対パスを worker へ渡します。ジョブ状態は Go API プロセス内のメモリで管理します。

```json
{
  "sessionId": "session-1",
  "baseImageIndex": 0
}
```

`STELLA_COMP_WORKER_ADDR` は Go API と Rust worker の両方で使います。未指定時は `[::1]:50051` です。

## 動作確認

Web アプリの型チェック:

```sh
cd apps/web
mise exec -- pnpm typecheck
```

Web アプリのビルド:

```sh
cd apps/web
mise exec -- pnpm build
```

Go API のテスト:

```sh
cd apps/api
GOCACHE=$PWD/.gocache GOMODCACHE=$PWD/.gomodcache mise exec -- go test ./...
```

Rust workspace のチェック:

```sh
mise exec -- cargo check
```

## 開発メモ

- `apps/web` は TypeScript + Next.js のフロントエンドです。
- `apps/api` は Go + gin の API サーバーです。
- `crates/stellacomp` は `hoshikasane/stellacomp` から移植した画像処理コアです。
- `crates/worker` は Protocol Buffers の `ImageProcessor` を実装する Rust gRPC server です。
- RAW/CR3 ファイルはブラウザに D&D できます。
- CR3 は Web Worker で埋め込み JPEG 候補を抽出し、プレビュー JPEG 生成に使います。
- CR2 など未対応 RAW は現時点では `RAW pending` として扱います。
- 圧縮後の preview JPEG は Go API の `/api/preview-uploads` にアップロードします。
- 現在の Web UI は、アップロード済み preview JPEG を `/api/preview-alignments` の非同期ジョブ経由で Rust worker に渡し、完了後に返却された変換行列でブラウザ側プレビュー合成を実行します。
- `/api/jobs` はサーバー側 preview JPEG 合成の比較・フォールバック用として残しています。
- 最終的な RAW 現像、プレビュー座標系から元画像座標系への変換行列補正、元画像ベースの合成は後続で拡張します。

## ポート競合時

`3000` が使用中の場合は、起動中の Next.js プロセスを確認してください。

```sh
ps -ef | grep 'next dev' | grep -v grep
```

別ポートで起動する場合は、上記の `--port` 指定を使ってください。
