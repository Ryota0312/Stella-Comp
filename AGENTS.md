# AGENTS.md

このプロジェクトはまだ開発初期段階です。
このため、開発を進めながら AGENTS.md も自律的に更新してください。
また、spec/ディレクトリに仕様書を配置します。機能追加・実装の際には仕様書の参照や更新も合わせて実施してください。

## プロジェクト概要

星景写真の合成・レタッチを行うWebアプリケーションです。

赤道儀を用いない三脚固定撮影では、星は日周運動により長時間露光により線として記録されます。
また、赤道儀を用いる場合でも極軸合わせの精度が悪い場合は線のように記録されていまいます。
このため、星景写真の撮影では、しばしばISO感度を上げた短時間露光の写真を複数枚撮影し、
それらを加算平均合成することでノイズの少ない点像の星空を写す手法が用いられます。

※ ISO感度を上げると明るく映る変わりにランダムノイズが増加するが、加算平均合成によりランダムノイズの低減が可能。

しかし、短時間露光の写真を加算平均合成する場合は、星の位置が揃っている必要があります。

そこで、このアプリケーションでは、読み込んだ複数枚の写真の星の位置合わせを実施した上で、加算平均合成によるノイズ低減ができることを目指します。

## 使用技術

mise でツールバージョンを管理する。現在の固定バージョンは `.mise.toml` を参照する。

- Webバックエンド: Go, gin
- Webフロントエンド: TypeScript, Next.js
- 星位置合わせ・合成などの画像処理コア: TypeScript/ブラウザ WASM/Rust
- Go/Rust 間の内部 RPC: gRPC, Protocol Buffers

## 開発方針

- 仕様は `spec/` 配下に追加・更新する。
- セットアップ、動作確認、開発サーバー起動手順は `README.md` を参照する。
- Codex は原則として開発サーバーを起動しない。ユーザーに `README.md` の起動手順を案内する。
- 画像処理はサーバー負荷を避けるため、可能な範囲でクライアントサイドへ寄せる。RAW 現像と将来の元画像合成はブラウザ WASM/Canvas/Worker 側で成立するかを優先検証する。Rust worker は位置合わせ推定、比較用サーバー処理、将来の有料/高品質サーバー処理候補として扱う。
- Go/Rust 間の API 境界は `proto/` 配下の Protocol Buffers 定義を正とする。
- 大きい画像データは gRPC メッセージ本体に載せず、ローカルパスまたは将来のオブジェクトストレージ URI を渡す。
- Docker Compose では HTTPS Portal、nginx、Next.js、Go API、Rust worker、Valkey を起動する。HTTPS Portal で TLS 終端し、nginx は内部リバースプロキシとして `/` と `/api/` を振り分ける。Compose 環境では API と worker が共有 volume `/data` を同じ絶対パスとして使う。
- GitHub Actions は image publish と VPS deploy を分ける。`.github/workflows/publish-images.yml` は `main` / `master` への push で検証と GHCR image publish を行う。PR merge も base branch への push として扱う。`v1.0.0` のような正式 SemVer tag では同じ tag の GHCR image を publish して production deploy し、`v1.0.0-rc.1` のような SemVer prerelease tag では staging deploy する。`.github/workflows/deploy.yml` は reusable workflow と手動 rollback 用 `workflow_dispatch` を提供し、VPS では `compose.deploy.yml` を使い、Actions が push した GHCR image を pull して起動する。
- Redis 互換キュー基盤は Valkey を標準候補にする。現時点のジョブ管理は Go API プロセス内メモリだが、API 複数 replica 化、再起動耐性、retry/cancel/timeout を入れる段階で job store と queue を Valkey へ移す。
- 初期 VPS 運用は個人利用の検証を目的とし、preview 変換行列推定の並列数制限や待機キューは本番提供前の課題として扱う。本番提供前には VPS 実測に基づく resource sizing、Rust worker 同時実行数制限、待機 queue、upload size / 画像枚数 / timeout / retry / cancel 上限を設計する。詳細は `spec/deployment.md` を参照する。
- 既存実装 [`Ryota0312/hoshikasane`](https://github.com/Ryota0312/hoshikasane) の `stellacomp` Rust ライブラリを移植候補として扱う。
- ローカルに `hoshikasane` の clone があり未コミット変更がある場合は、ユーザー変更として扱い、勝手に巻き戻さない。
- 実装開始時は、まず最小の縦断スライスを作る。例: ブラウザでのRAW/preview生成、preview upload、Rust worker による位置合わせ推定、ブラウザ側合成。
- 現在の最小縦断は preview JPEG first。Web UI は RAW の D&D 直後には重い RAW 現像をせず、埋め込み JPEG またはブラウザで軽量生成した preview JPEG を `POST /api/preview-uploads` に送る。その後 `POST /api/preview-alignments` で Rust worker の `EstimateTransforms` を呼ぶ非同期ジョブを作成し、`GET /api/preview-alignments/:alignmentJobID` でpreview座標系の2x3アフィン変換行列を受け取り、ブラウザ Canvas でpreview JPEGを加算平均合成する。この preview upload/preview 合成は D&D 後に自動実行してよい。結果確認 UI では合成結果と基準 preview JPEG の切替/左右比較、カーソル位置のピクセル等倍確認をクライアント側で行う。ユーザーが preview 結果を確認して本画像合成ステップへ進んだ時点で、`libraw-wasm` による RAW 現像と元画像合成を開始する。本画像合成ステップ内の実行ボタンは再実行や将来のオプション変更後の実行用として残す。RAW 現像と元画像合成中は進捗を表示する。`POST /api/jobs` は Rust worker の `AlignAndAverage` によるサーバー側preview合成の比較・フォールバック用として残す。
- Web UI の結果画像上には、状態、形式、操作ボタンなどの常時表示 UI を重ねない。ただし preview 合成中や本画像合成中は、前回結果を参考表示として薄く残し、右ペインだけでも進行中と分かる半透明の処理中オーバーレイと進捗を一時表示してよい。星景写真家向けの通常表示はフレーム数、preview 生成状況、位置合わせ/合成状況、本画像処理進捗、書き出し形式、警告に絞る。preview payload、圧縮率、アップロード件数、job ID、内部ステータス、warning code などのデバッグ情報は staging のみ画面下部に表示する。
- Web UI では画像を1枚以上選択した後、キューを明示的にクリアするまでブラウザリロード、タブ閉じ、URL 遷移、通常の同一タブリンク遷移に離脱警告を出す。結果生成やダウンロード完了だけでは警告を解除しない。
- 結果パネルの操作は画像に重ねず、表示モード付近に置く。最終結果フェーズでは選択中の成果物形式（TIFF / PNG / JPEG）のダウンロードを同じ操作群の主操作として強調する。フェーズ遷移ボタンは結果画像側へ float/absolute 配置せず、処理状況パネル側の通常フローに置く。
- Web UI の左ペインはフェーズごとの最小操作に絞る。フェーズ1はドロップエリア、基準フレーム、位置合わせ方式、変換モデル、選択済みフレーム一覧、フェーズ2は方式・モデル・フレーム数・書き出し形式選択、フェーズ3は方式・モデル・フレーム数・書き出し形式の読み取り表示を基本とする。次フェーズ CTA と戻る操作は左ペイン下部の固定アクション領域に置く。
- Web UI の配色は、シアンを現在ステップ・選択状態・プレビュー処理、青を次フェーズ CTA、緑を成果物ダウンロードと成功状態、グレーを補助操作、アンバーを警告や処理中、赤をエラーや失敗に使う。次フェーズ CTA は通常のシアン系処理ボタンより強く表示し、シアンの塗りボタンは乱用しない。
- 最終結果フェーズの基準/合成比較と等倍確認では、preview JPEG ではなく、合成結果と同じ RAW 現像または元画像デコード経路で生成した基準フレーム PNG を比較対象にする。
- プレビュー合成後の画面では、本画像合成の書き出し形式を TIFF / PNG / JPEG から選択できる。TIFF は 16bit 後処理向け、PNG は劣化なし 8bit、JPEG はスマホ保存・共有向けの軽量出力として扱う。結果表示と等倍確認はブラウザ互換性のため常に PNG を使い、TIFF 選択時のみ TIFF エンコードを追加で実行する。
- preview JPEG の位置合わせ方式は Web UI で `stars`（星検出・標準）と `akaze`（旧方式）を選択できる。`EstimateTransforms` の方式未指定または未知値は互換性のため `akaze` として扱う。`stars` は星候補の局所輝度ピークと近傍距離比による対応付けから部分アフィン変換を推定し、画面端の流れが残る場合は homography やメッシュワープを後続で検討する。
- 位置合わせアルゴリズム改善は `spec/alignment-roadmap.md` を参照する。直近では検出手法選択をプレビュー生成前へ移動し、`stars + affine` を標準として維持しながらホモグラフィ比較、対応星残差可視化、局所ワープへ段階的に進める。通常 UI を過密にせず、詳細比較は CLI example または staging debug に寄せる。
- ジョブ状態は現時点では Go API プロセス内メモリ管理。永続化、キャンセル、進捗 streaming は後続で実装する。
- アップロード済み preview JPEG と `/api/jobs` の fallback 合成結果は Go API の cleanup worker が標準 24 時間 TTL で削除する。通常フローのブラウザ側 preview 合成 PNG は Blob URL で扱い、サーバーには保存しない。TTL と実行間隔は `STELLA_COMP_CLEANUP_TTL` / `STELLA_COMP_CLEANUP_INTERVAL` で変更できる。
- Rust workspace の検証は `.mise.toml` の固定 Rust toolchain を使うため、`mise exec -- cargo check` や `mise exec -- cargo check -p worker` で実行する。素の `cargo` は環境側の古い toolchain を拾う可能性がある。
- Rust workspace の検証には OpenCV と libclang/LLVM の開発パッケージが必要。`pkg-config --libs --cflags opencv4` または `OpenCVConfig.cmake` が解決できない環境、または `llvm-config` / libclang がない環境では `cargo check` が失敗する。
