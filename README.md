# Stella Comp

星景写真の合成・レタッチを行う Web アプリケーションです。

## セットアップ

このリポジトリではツールバージョンを mise で管理します。JavaScript / pnpm 関連の管理ファイルは `apps/web` 配下に寄せています。

Rust の画像処理コアは OpenCV と libclang/LLVM に依存します。Rust workspace をチェックまたは worker を起動する前に、`pkg-config` から `opencv4` を検出でき、`llvm-config` / libclang を使えるようにしてください。

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

staging 用のデバッグ表示を確認する場合は、Next.js 起動時に `NEXT_PUBLIC_APP_ENV=staging` を指定します。これにより、画面の処理状況パネル下部に `staging debug` として preview payload、compression、uploaded previews、alignment job、内部ステータス、出力形式、警告数などが表示されます。

```sh
cd apps/web
NEXT_PUBLIC_APP_ENV=staging mise exec -- pnpm dev
```

ポートを指定する場合:

```sh
cd apps/web
mise exec -- pnpm dev --hostname 127.0.0.1 --port 3001
```

IntelliJ から起動する場合は、共有 Run Configuration の `Web Dev`、`API Dev`、`image proc worker` を使ってください。Docker Compose でまとめて起動する場合は IntelliJ の Docker Compose Configuration `Compose Up` を使います。`Compose Up` では Environment variables に `DOCKER_API_VERSION=1.52` を指定してください。`Web Dev` は `apps/web/package.json` の `dev` を、`mise exec -- which pnpm` で確認できる `pnpm` 実体パスで起動する設定にしています。`API Dev` は Go Application として working directory を `apps/api` にし、directory target `apps/api/cmd/api` を起動します。`image proc worker` は Cargo Command として workspace ルートで `cargo run -p worker` を実行します。Go SDK と Rust toolchain は mise で入れたものを IntelliJ 側に設定してください。Rust plugin の toolchain location は rustup shim ではなく `cargo`/`rustc` が直接置かれている `bin` ディレクトリ、たとえば `~/.rustup/toolchains/1.96.0-x86_64-unknown-linux-gnu/bin` を指定します。標準ライブラリ解析には `rustup component add rust-src --toolchain 1.96.0-x86_64-unknown-linux-gnu` で `rust-src` を追加しておきます。

## Docker Compose での起動

VPS 運用やコンテナイメージ検証用に、HTTPS Portal、nginx、Next.js、Go API、Rust worker、Valkey を Docker Compose で起動できます。

```sh
DOCKER_API_VERSION=1.52 docker compose -f compose.yml up --build
```

起動後は HTTPS Portal 経由で `https://localhost` にアクセスします。標準設定では `STELLA_COMP_HTTPS_STAGE=local` の自己署名証明書を使うため、ブラウザで証明書警告が表示されます。

Docker Compose で staging 用のデバッグ表示を確認する場合は、Web image の build 時に `STELLA_COMP_DEPLOY_STAGE=staging` を渡します。

```sh
DOCKER_API_VERSION=1.52 STELLA_COMP_DEPLOY_STAGE=staging docker compose -f compose.yml up --build
```

```text
https://localhost/      Next.js
https://localhost/api/  Go API
```

HTTP 側は `http://localhost` で受け、HTTPS Portal が HTTPS へリダイレクトします。Compose 環境では Go API と Rust worker が同じ named volume を `/data` に mount します。Go API は preview JPEG を `/data/uploads/previews/` に保存し、同じ絶対パスを worker に渡します。

Valkey は Redis 互換のジョブキュー・ジョブ状態管理 backend 候補として同時に起動します。現時点の API 実装はまだプロセス内メモリでジョブ状態を管理し、goroutine で worker を呼び出します。API の複数 replica 化、再起動耐性、retry、cancel、timeout が必要になる段階で、job store と queue をセットで Valkey に移します。詳細は `spec/deployment.md` を参照してください。

この環境では Docker daemon が Docker API 1.44 以上を要求するため、Compose 起動時は `DOCKER_API_VERSION=1.52` を指定します。これを指定しないと、IntelliJ の起動環境に古い `DOCKER_API_VERSION` が残っている場合に `client version 1.42 is too old` が出ることがあります。

### HTTPS 設定

Compose の標準設定はローカル検証向けです。

```text
STELLA_COMP_HTTP_PORT=80
STELLA_COMP_HTTPS_PORT=443
STELLA_COMP_HTTPS_DOMAINS=localhost -> http://nginx:80
STELLA_COMP_HTTPS_STAGE=local
```

`80` または `443` が他のプロセスで使用中の場合は、`STELLA_COMP_HTTP_PORT=8080` や `STELLA_COMP_HTTPS_PORT=8443` のようにホスト側ポートを変更してください。その場合のアクセス先は `https://localhost:8443` になります。

Chrome の「保護されていない通信」警告は、local stage の自己署名証明書が OS / ブラウザに信頼されていないために表示されます。これは通信が平文 HTTP になっているという意味ではなく、証明書の発行元を Chrome が信頼できないという意味です。警告なしにしたい場合は、実ドメインで production stage の Let's Encrypt 証明書を使うか、ローカル証明書またはローカル CA を OS / Chrome の信頼ストアに追加する必要があります。

VPS で実ドメインの証明書を取得する場合は、DNS をサーバーへ向けた上で 80/443 を公開し、HTTPS Portal の production stage を使います。

```sh
STELLA_COMP_HTTP_PORT=80 \
STELLA_COMP_HTTPS_PORT=443 \
STELLA_COMP_HTTPS_DOMAINS='example.com -> http://nginx:80' \
STELLA_COMP_HTTPS_STAGE=production \
DOCKER_API_VERSION=1.52 docker compose -f compose.yml up --build
```

Let's Encrypt の HTTP-01 challenge を通すため、本番証明書の取得時は対象ドメインの 80 番ポートがインターネットから到達可能である必要があります。

## GitHub Actions でのイメージ公開とデプロイ

`main` または `master` ブランチに push されると、`.github/workflows/publish-images.yml` が検証、Docker image build、GHCR への push を実行します。Pull Request の merge も base branch への push として検知します。

release 用の tag を push した場合も同じ workflow が実行されます。`v1.0.0` のような正式 SemVer tag は production に、`v1.0.0-rc.1` や `v1.0.0-beta.1` のような SemVer prerelease tag は staging に自動デプロイします。Git tag 自体が対象 commit を指すため、tag 名に commit hash を含める必要はありません。`v1.0.0+build.1` のような build metadata 付き tag は Docker image tag との対応を単純に保つため非対応です。

image は GitHub Container Registry の以下に公開します。owner と repo は GitHub Actions 内で小文字化します。

```text
ghcr.io/<owner>/<repo>/web:<commit-sha>
ghcr.io/<owner>/<repo>/api:<commit-sha>
ghcr.io/<owner>/<repo>/worker:<commit-sha>
ghcr.io/<owner>/<repo>/web:latest
ghcr.io/<owner>/<repo>/api:latest
ghcr.io/<owner>/<repo>/worker:latest
ghcr.io/<owner>/<repo>/web:v1.0.0
ghcr.io/<owner>/<repo>/api:v1.0.0
ghcr.io/<owner>/<repo>/worker:v1.0.0
```

VPS への反映は release tag の push で自動実行します。rollback や検証用に `.github/workflows/deploy.yml` の `workflow_dispatch` から手動実行することもでき、任意の image tag と HTTPS Portal stage を指定できます。VPS 契約後、Repository secrets に以下を設定してください。

```text
DEPLOY_HOST                    VPS の host name または IP
DEPLOY_USER                    SSH 接続ユーザー
DEPLOY_PORT                    SSH port。未設定時は 22
DEPLOY_PATH                    VPS 上の配置先。例: /opt/stella-comp
DEPLOY_SSH_KEY                 SSH 秘密鍵
STELLA_COMP_HTTPS_DOMAINS      例: example.com -> http://nginx:80
GHCR_USERNAME                  private package を pull する場合のみ
GHCR_TOKEN                     private package を pull する場合のみ。read packages 権限が必要
```

GitHub Secrets の `STELLA_COMP_HTTPS_DOMAINS` にはシェル用の引用符を含めず、`example.com -> http://nginx:80` の形式で保存します。`example.com` だけを指定した場合や、値に引用符が含まれる場合、HTTPS Portal は nginx への proxy ではなく静的サイトとして扱い、`Welcome to HTTPS-PORTAL!` の既定ページを返すことがあります。

VPS 側には Docker Engine と Docker Compose plugin が必要です。また、`DEPLOY_USER` は passwordless sudo なしで `docker` / `docker compose` を実行できる必要があります。一般的には VPS 上で `sudo usermod -aG docker <DEPLOY_USER>` を実行し、いったん SSH セッションを切断して再ログインしてから `docker ps` が通ることを確認します。

Deploy workflow は `compose.deploy.yml` と `deploy/nginx.conf` を `DEPLOY_PATH` へ配置し、GHCR から `web` / `api` / `worker` の image を pull して `docker compose -f compose.deploy.yml up -d --remove-orphans` を実行します。`permission denied while trying to connect to the Docker daemon socket` が出る場合は、GHCR 認証ではなく `DEPLOY_USER` の Docker socket 権限が不足しています。

本番 image の差し替え用 Compose file は `compose.deploy.yml` です。ローカル検証用の `compose.yml` と異なり `build:` を持たず、以下の環境変数で image を受け取ります。

```text
STELLA_COMP_WEB_IMAGE
STELLA_COMP_API_IMAGE
STELLA_COMP_WORKER_IMAGE
```

詳細は `spec/deployment.md` を参照してください。

## エンドポイント方針

ローカル開発では Next.js と Go API を別ポートで起動します。

```text
http://localhost:3000  Next.js
http://localhost:8080  Go API
```

Docker Compose では HTTPS Portal, nginx, Next.js, Go API, Rust worker, Valkey を立て、HTTPS Portal で TLS 終端し、nginx で同一オリジンにまとめます。

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
- サーバー負荷を抑えるため、RAW 現像や将来の元画像合成は可能な範囲でブラウザ WASM/Canvas/Worker 側へ寄せます。Rust worker は当面、preview JPEG の位置合わせ推定とサーバー合成比較用に使います。
- RAW/CR3 ファイルはブラウザに D&D できます。
- D&D 直後の RAW は重い現像をせず、まず埋め込み JPEG 候補を抽出して preview JPEG 生成に使います。
- CR2 など埋め込み preview を抽出できない RAW は、現時点では `RAW pending` として扱います。
- 圧縮後の preview JPEG は Go API の `/api/preview-uploads` にアップロードします。
- 現在の Web UI は、アップロード済み preview JPEG を `/api/preview-alignments` の非同期ジョブ経由で Rust worker に渡し、完了後に返却された変換行列でブラウザ側プレビュー合成を実行します。
- preview 合成確認後、`RAW現像して合成` で `libraw-wasm` によるブラウザ側 RAW 現像、preview 座標系から元画像座標系への変換行列補正、元画像ベースの加算平均合成を試します。画面表示と等倍確認には PNG preview を生成し、本処理成果物はプレビュー合成後の画面で TIFF / PNG / JPEG から選んでダウンロードします。TIFF は後処理向け、PNG は劣化なしの 8bit 出力、JPEG はスマホ保存・共有向けの軽量出力として扱います。
- `/api/jobs` はサーバー側 preview JPEG 合成の比較・フォールバック用として残しています。
- RAW 現像結果と埋め込み preview の crop/orientation 差分補正、真の 16bit/linear 合成、メモリ削減は後続で拡張します。

## ポート競合時

`3000` が使用中の場合は、起動中の Next.js プロセスを確認してください。

```sh
ps -ef | grep 'next dev' | grep -v grep
```

別ポートで起動する場合は、上記の `--port` 指定を使ってください。
