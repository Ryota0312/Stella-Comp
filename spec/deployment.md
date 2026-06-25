# Deployment

## Docker Compose 構成

ローカル検証と小規模 VPS 運用の入口として、Docker Compose で以下を起動する。

```text
HTTPS Portal -> nginx -> Next.js web
                     -> Go API -> Rust worker
                              -> Valkey
```

- `https-portal`
  - 外部公開口。
  - TLS 終端を担当し、内部の nginx へ HTTP proxy する。
  - 標準では `STELLA_COMP_HTTPS_STAGE=local` と `localhost -> http://nginx:80` を使い、自己署名証明書で `https://localhost:8443` を提供する。
  - VPS で実ドメインを使う場合は `STELLA_COMP_HTTP_PORT=80`、`STELLA_COMP_HTTPS_PORT=443`、`STELLA_COMP_HTTPS_STAGE=production`、`STELLA_COMP_HTTPS_DOMAINS='<domain> -> http://nginx:80'` を指定し、Let's Encrypt 証明書を取得する。
  - 証明書や ACME 状態は `https-portal-data` volume に保存する。
- `nginx`
  - アプリ内部のリバースプロキシ。
  - `/` を Next.js、`/api/` を Go API へ proxy する。
  - preview JPEG upload を扱うため、`client_max_body_size` と proxy timeout を明示する。
  - HTTPS Portal から受け取った `X-Forwarded-Proto` を Go API / Next.js へ引き継ぐ。
- `web`
  - Next.js standalone build。
  - Compose では `NEXT_PUBLIC_API_BASE_URL=/api` を build 時に埋め込み、nginx 経由の同一オリジン API を使う。
- `api`
  - Go + gin の REST API。
  - `STELLA_COMP_DATA_DIR=/data` を使い、upload と job result を共有 volume に保存する。
  - `STELLA_COMP_WORKER_ADDR=worker:50051` で Rust worker に接続する。
- `worker`
  - Rust gRPC server。
  - API と同じ `stella-data` volume を `/data` に mount し、API から渡された絶対パスを読めるようにする。
- `valkey`
  - Redis 互換の queue / job state backend 候補。
  - Append only file を有効にし、再起動時にも queue state を残せる構成にする。

Compose 起動時は `DOCKER_API_VERSION=1.52` を指定する。IntelliJ の Docker Compose Configuration `Compose Up` でも Environment variables に同じ値を設定する。

ローカル検証の標準アクセス先は以下とする。

```text
https://localhost:8443/      Next.js
https://localhost:8443/api/  Go API
http://localhost:8080/       HTTPS Portal 経由の HTTP
```

本番証明書の取得には Let's Encrypt の HTTP-01 challenge が必要になるため、対象ドメインの 80 番ポートが HTTPS Portal へ到達できる状態にする。

## Valkey 採用方針

Redis 互換の汎用キュー基盤としては Valkey を標準候補にする。

- Redis protocol と既存 Go client ecosystem をそのまま使いやすい。
- OSS として継続利用しやすく、VPS の単体運用から managed Redis 互換サービスへの移行もしやすい。
- 画像処理ジョブのような「少数だが重い」処理では、最初から専用 queue system を入れるより運用面が軽い。

MVP の現在実装は Go API プロセス内メモリでジョブ状態を管理し、goroutine で Rust worker の同期 gRPC を呼ぶ。これは単一 API プロセスでは動くが、API の複数 replica 化、再起動耐性、ジョブの retry / timeout / cancel を考えると不足する。

次の段階では、queue だけでなく job store も合わせて Valkey へ移す。

- job 作成時に job state を Valkey hash などへ保存する。
- pending queue は Valkey list または stream で管理する。
- API replica のうち worker loop を持つプロセスが queue から dequeue し、Rust worker gRPC を呼ぶ。
- status polling は Go API のメモリではなく Valkey の job state を読む。
- running job には lease / visibility timeout を持たせ、API プロセス終了時に再試行できるようにする。
- result file は当面 `/data/jobs/<job-id>/` に置き、将来 S3 互換 object storage URI へ置き換えられるようにする。

この移行を行うまでは、Compose の Valkey は将来キュー基盤の同居コンテナとして立ち上げるが、既存ジョブ実行 path は従来どおりプロセス内メモリを使う。

## スケール方針

初期 VPS 運用では 1 compose project に web / api / worker / valkey / nginx を同居させる。画像処理の CPU 負荷が増えた段階で、以下の順に分離する。

1. `worker` replica を増やし、Go API 側の queue consumer 数と Rust worker 接続先を整理する。
2. `api` を複数 replica 化し、job state / queue を Valkey へ完全移行する。
3. `/data` volume を S3 互換 object storage へ移す。
4. Valkey を managed Redis 互換サービスまたは専用 VM へ移す。

## GitHub Actions デプロイ方針

VPS 接続先が未定の間、`.github/workflows/deploy.yml` は `workflow_dispatch` による手動実行のみを有効にする。VPS 準備後は `main` または `master` ブランチへの `push` trigger を workflow に戻し、コミット追加や Pull Request merge のたびに実行する。Pull Request の merge は base branch への push として検知できるため、PR closed event ではなく branch push を正のデプロイトリガーにする。

workflow は以下の段階で実行する。

1. `validate`
   - mise の固定バージョンを使って Web typecheck / Web build / Go test / Rust cargo check を実行する。
   - Rust check では OpenCV と Protocol Buffers compiler を runner に入れる。
2. `publish-images`
   - `apps/web/Dockerfile`、`apps/api/Dockerfile`、`crates/worker/Dockerfile` から本番イメージを build する。
   - GitHub Container Registry に `ghcr.io/<owner>/<repo>/web:<commit-sha>`、`api:<commit-sha>`、`worker:<commit-sha>` と `latest` tag を push する。
3. `deploy`
   - VPS 接続情報が GitHub Secrets に設定されている場合だけ、SSH で `compose.deploy.yml` と `deploy/nginx.conf` を配置し、VPS 上で `docker compose -f compose.deploy.yml pull` と `up -d --remove-orphans` を実行する。
   - VPS 接続情報が未設定の場合は、検証とイメージ publish まで実行し、remote deploy は skip する。

VPS 側の本番起動には `compose.deploy.yml` を使う。この Compose file は `build:` を持たず、GitHub Actions が GHCR に push した image を pull して起動する。これにより、VPS 上で重い Docker build を行わず、deploy は image の差し替えと Compose restart に限定する。

`push` trigger を有効化する場合は、workflow の `on:` を以下の形に戻す。

```yaml
on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:
```

GitHub Secrets は以下を使う。

- `DEPLOY_HOST`
  - VPS の host name または IP address。
- `DEPLOY_USER`
  - SSH 接続ユーザー。Docker compose を実行できる権限が必要。
- `DEPLOY_PORT`
  - SSH port。未設定時は `22`。
- `DEPLOY_PATH`
  - VPS 上の配置先ディレクトリ。例: `/opt/stella-comp`。
- `DEPLOY_SSH_KEY`
  - deploy user で SSH 接続するための秘密鍵。
- `STELLA_COMP_HTTPS_DOMAINS`
  - HTTPS Portal の `DOMAINS`。例: `example.com -> http://nginx:80`。
- `STELLA_COMP_HTTPS_STAGE`
  - HTTPS Portal の stage。未設定時は `production`。証明書検証前は `staging` を使う。
- `GHCR_USERNAME`
  - GHCR package が private の場合に VPS 上で `docker login ghcr.io` するユーザー名。
- `GHCR_TOKEN`
  - GHCR package が private の場合に VPS 上で使う read packages 権限付き token。GHCR package を public にする場合や VPS 側で事前 login する場合は省略できる。

VPS 側の前提条件:

- Docker Engine と Docker Compose plugin がインストール済み。
- `DEPLOY_USER` が Docker を実行できる。
- 80 / 443 番ポートが公開され、対象ドメインの DNS が VPS に向いている。
- `DEPLOY_PATH` 配下に `compose.deploy.yml` と `deploy/nginx.conf` を配置できる。

初期運用では rollback は GHCR の過去 commit SHA tag を指定して `compose.deploy.yml` を再起動する手動運用とする。自動 rollback、healthcheck 後の昇格、blue-green deploy は後続で検討する。
