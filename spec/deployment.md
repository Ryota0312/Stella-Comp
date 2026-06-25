# Deployment

## Docker Compose 構成

ローカル検証と小規模 VPS 運用の入口として、Docker Compose で以下を起動する。

```text
nginx -> Next.js web
      -> Go API -> Rust worker
               -> Valkey
```

- `nginx`
  - 外部公開口。
  - `/` を Next.js、`/api/` を Go API へ proxy する。
  - preview JPEG upload を扱うため、`client_max_body_size` と proxy timeout を明示する。
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
