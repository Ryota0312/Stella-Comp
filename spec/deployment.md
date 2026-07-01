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
  - 標準では `STELLA_COMP_HTTPS_STAGE=local` と `localhost -> http://nginx:80` を使い、自己署名証明書で `https://localhost` を提供する。
  - local stage の自己署名証明書は OS / ブラウザに信頼されていないため、Chrome では「保護されていない通信」と表示される。これは TLS が無効という意味ではなく、証明書の発行元を信頼できないという意味で扱う。警告なしにする場合は、実ドメインの production stage で Let's Encrypt 証明書を使うか、ローカル証明書またはローカル CA を信頼ストアへ追加する。
  - VPS で実ドメインを使う場合は `STELLA_COMP_HTTP_PORT=80`、`STELLA_COMP_HTTPS_PORT=443`、`STELLA_COMP_HTTPS_STAGE=production`、`STELLA_COMP_HTTPS_DOMAINS='<domain> -> http://nginx:80'` を指定し、Let's Encrypt 証明書を取得する。
  - 証明書や ACME 状態は `https-portal-data` volume に保存する。
- `nginx`
  - アプリ内部のリバースプロキシ。
  - `/` を Next.js、`/api/` を Go API へ proxy する。
  - preview JPEG upload を扱うため、`client_max_body_size` と proxy timeout を明示する。
  - HTTPS Portal から受け取った `X-Forwarded-Proto` を Go API / Next.js へ引き継ぐ。
- `web`
  - Next.js standalone build。
  - Compose では `NEXT_PUBLIC_API_BASE_URL=/api` を build 時に埋め込み、nginx 経由の同一オリジン API を使う。ローカル Compose build では `STELLA_COMP_DEPLOY_STAGE` を `NEXT_PUBLIC_DEPLOY_STAGE` に渡し、`staging` の場合のみ Web UI 下部にデバッグ情報を表示する。
- `api`
  - Go + gin の REST API。
  - `STELLA_COMP_DATA_DIR=/data` を使い、upload と job result を共有 volume に保存する。
  - upload preview と fallback job result は標準 24 時間 TTL の cleanup 対象にする。TTL と実行間隔は `STELLA_COMP_CLEANUP_TTL` / `STELLA_COMP_CLEANUP_INTERVAL` で調整し、`0` または負値では cleanup を無効化する。
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
https://localhost/      Next.js
https://localhost/api/  Go API
http://localhost/       HTTPS Portal 経由の HTTP redirect
```

ホスト側の 80 / 443 が使用中の場合は、`STELLA_COMP_HTTP_PORT` と `STELLA_COMP_HTTPS_PORT` で公開ポートを変更する。

本番証明書の取得には Let's Encrypt の HTTP-01 challenge が必要になるため、対象ドメインの 80 番ポートが HTTPS Portal へ到達できる状態にする。

## Valkey 採用方針

Redis 互換の汎用キュー基盤としては Valkey を標準候補にする。

- Redis protocol と既存 Go client ecosystem をそのまま使いやすい。
- OSS として継続利用しやすく、VPS の単体運用から managed Redis 互換サービスへの移行もしやすい。
- 画像処理ジョブのような「少数だが重い」処理では、最初から専用 queue system を入れるより運用面が軽い。

Go API は `STELLA_COMP_QUEUE_URL` が設定されている場合、Valkey を job store と queue の正として使う。Compose / deploy 環境では `redis://valkey:6379/0` を指定する。

- job 作成時に job state を Valkey hash に保存する。
- pending queue は Valkey Streams と consumer group で管理する。
- API プロセス内 worker loop が `XREADGROUP` / `XAUTOCLAIM` で dequeue し、Rust worker gRPC を呼ぶ。
- status polling は Go API のメモリではなく Valkey の job state を読む。
- 並列数制限は worker loop 数で制御し、`STELLA_COMP_ALIGNMENT_CONCURRENCY` / `STELLA_COMP_COMPOSITE_CONCURRENCY` で変更する。標準値はどちらも 1。
- API 起動時の Valkey 接続待ちは `STELLA_COMP_QUEUE_CONNECT_TIMEOUT` で変更する。標準値は 30 秒。
- Pub/Sub は job dispatch には使わない。必要になった場合も状態変更通知の補助に留め、通常 UI は polling を継続する。
- result file は当面 `/data/jobs/<job-id>/` に置き、将来 S3 互換 object storage URI へ置き換えられるようにする。

`STELLA_COMP_QUEUE_URL` が未設定のローカル開発では、同じ interface のプロセス内メモリ store / queue を使う。この場合も bounded queue と worker loop により並列数制限は維持するが、API 再起動で job state は失われる。

## スケール方針

初期 VPS 運用では 1 compose project に web / api / worker / valkey / nginx を同居させる。画像処理の CPU 負荷が増えた段階で、以下の順に分離する。

初期 VPS 運用では preview 変換行列推定と fallback 合成の同時実行数を標準 1 に制限し、受付済み job は Streams 上で `queued` のまま待機させる。本番提供前には VPS の実測負荷をもとに、以下を必ず見直す。

- VPS の CPU / memory / swap / disk I/O 使用量と preview JPEG 枚数・解像度ごとの処理時間を測る。
- Rust worker の同時実行数を実測に合わせて調整する。小規模 VPS では 1 並列を基準にし、余裕が確認できた場合だけ増やす。
- 待機中 job の UI 表示を必要に応じて改善する。厳密な queue position は当面出さず、`queued` 表示を正とする。
- API 複数 replica 化時の consumer 数、worker 接続先、pending job 回収間隔を調整する。
- upload size、1 session あたりの画像枚数、処理 timeout、失敗時 retry / cancel の上限を定義する。

1. `worker` replica を増やし、Go API 側の queue consumer 数と Rust worker 接続先を整理する。
2. `api` を複数 replica 化し、job state / queue を Valkey へ完全移行する。
3. `/data` volume を S3 互換 object storage へ移す。
4. Valkey を managed Redis 互換サービスまたは専用 VM へ移す。

## GitHub Actions イメージ公開・デプロイ方針

イメージ公開とVPS反映は別 workflow に分ける。

- `.github/workflows/publish-images.yml`
  - `main` または `master` ブランチへの push で実行する。
  - Pull Request の merge は base branch への push として検知できるため、PR closed event ではなく branch push を正の publish trigger にする。
  - `v1.0.0` のような正式 SemVer tag と、`v1.0.0-rc.1` のような SemVer prerelease tag への push でも実行する。
  - 手動再実行用に `workflow_dispatch` も許可する。
- `.github/workflows/deploy.yml`
  - VPS への反映だけを担当する。
  - `workflow_call` で `publish-images.yml` から呼び出せるようにし、tag image の publish 成功後に同じ tag をデプロイする。
  - rollback や検証用に `workflow_dispatch` の手動実行も許可し、任意の image tag と HTTPS Portal stage を指定できるようにする。

release tag は以下の形式だけを自動 deploy 対象にする。

- `v1.0.0` のような `^v[0-9]+\.[0-9]+\.[0-9]+$` は production として起動する。
- `v1.0.0-rc.1` や `v1.0.0-beta.1` のような `^v[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$` は staging として起動する。
- `v1.0.0+build.1` のような build metadata は Docker image tag との対応を単純に保つため非対応にする。

Git tag 自体が対象 commit を指すため、staging tag 名に commit hash を手で含める必要はない。

`publish-images.yml` は以下の段階で実行する。

1. `validate`
   - mise の固定バージョンを使って Web typecheck / Web build / Go test / Rust cargo check を実行する。
   - Rust check では OpenCV、libclang/LLVM、Protocol Buffers compiler を runner に入れる。
2. `publish-images`
   - `apps/web/Dockerfile`、`apps/api/Dockerfile`、`crates/worker/Dockerfile` から本番イメージを build する。
   - branch push では GitHub Container Registry に `ghcr.io/<owner>/<repo>/web:<commit-sha>`、`api:<commit-sha>`、`worker:<commit-sha>` と `latest` tag を push する。
   - tag push では `ghcr.io/<owner>/<repo>/web:<release-tag>`、`api:<release-tag>`、`worker:<release-tag>` を push し、`latest` は更新しない。
3. `deploy`
   - tag push の場合だけ実行する。
   - 正式 SemVer tag では `STELLA_COMP_HTTPS_STAGE=production`、SemVer prerelease tag では `STELLA_COMP_HTTPS_STAGE=staging` を渡して VPS 上の Compose を再起動する。

VPS 側の本番起動には `compose.deploy.yml` を使う。この Compose file は `build:` を持たず、GitHub Actions が GHCR に push した image を pull して起動する。これにより、VPS 上で重い Docker build を行わず、deploy は image の差し替えと Compose restart に限定する。

`deploy.yml` は、VPS 接続情報が GitHub Secrets に設定されていることを前提に SSH で `compose.deploy.yml` と `deploy/nginx.conf` を配置し、VPS 上で `docker compose -f compose.deploy.yml pull` と `up -d --remove-orphans` を実行する。VPS 接続情報が未設定の場合は、deploy workflow は失敗させて不足している secret を明示する。image publish とは workflow を分けているため、VPS 未準備でも通常の branch push による GHCR publish は継続できる。

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
  - GitHub Secrets には引用符を含めず、この形式の値そのものを保存する。ドメイン名だけを指定すると HTTPS Portal は静的サイトとして扱い、既定の Welcome ページを返すことがある。
- `STELLA_COMP_BASIC_AUTH_HTPASSWD`
  - nginx の Basic 認証で staging/private deploy を保護するための htpasswd 1 行。
  - `docker run --rm httpd:2.4-alpine htpasswd -nbB stella '<password>'` などで生成する。
- `GHCR_USERNAME`
  - GHCR package が private の場合に VPS 上で `docker login ghcr.io` するユーザー名。
- `GHCR_TOKEN`
  - GHCR package が private の場合に VPS 上で使う read packages 権限付き token。GHCR package を public にする場合や VPS 側で事前 login する場合は省略できる。

VPS 公開制限は `deploy.yml` の `access_mode` で制御する。`auto` は `https_stage=production` では `public`、`https_stage=staging` では `private` に解決する。正式 SemVer tag の自動 deploy は production/public、prerelease SemVer tag の自動 deploy は staging/private になる。公開前確認や一時的な非公開化では、手動 deploy で同じ image tag を指定し、必要に応じて `access_mode=public` または `private` を明示する。

VPS 側の前提条件:

- Docker Engine と Docker Compose plugin がインストール済み。
- `DEPLOY_USER` が passwordless sudo なしで Docker を実行できる。通常は `DEPLOY_USER` を `docker` group に追加し、SSH 再ログイン後に `docker ps` が成功する状態にする。`permission denied while trying to connect to the Docker daemon socket` は GHCR 認証ではなく Docker socket 権限不足として扱う。
- 80 / 443 番ポートが公開され、対象ドメインの DNS が VPS に向いている。
- `DEPLOY_PATH` 配下に `compose.deploy.yml` と `deploy/nginx.conf` を配置できる。

初期運用では rollback は `.github/workflows/deploy.yml` の手動実行で過去の release tag または commit SHA tag を指定して `compose.deploy.yml` を再起動する運用とする。自動 rollback、healthcheck 後の昇格、blue-green deploy は後続で検討する。
