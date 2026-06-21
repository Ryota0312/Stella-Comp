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

IntelliJ から起動する場合は、共有 Run Configuration の `Web Dev` と `API Dev` を使ってください。`Web Dev` は `apps/web/package.json` の `dev` を、`mise exec -- which pnpm` で確認できる `pnpm` 実体パスで起動する設定にしています。`API Dev` は Go Application として `apps/api/cmd/api` パッケージを起動します。Go SDK は mise で入れた Go を IntelliJ 側に設定してください。

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
```

`POST /api/preview-uploads` は preview JPEG を `multipart/form-data` の `previews` フィールドで受け取り、`.data/uploads/previews/<session-id>/` に保存します。

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
- 最終的な RAW 現像・位置合わせ・合成はサーバーサイド Rust worker で実装する方針です。

## ポート競合時

`3000` が使用中の場合は、起動中の Next.js プロセスを確認してください。

```sh
ps -ef | grep 'next dev' | grep -v grep
```

別ポートで起動する場合は、上記の `--port` 指定を使ってください。
