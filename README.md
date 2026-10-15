# claude-build-night-2026-10

Claude Build Night Tokyo(2026-10-15、テーマ claudeMods)で、ありさん(@ari_ac1d)が 90 分で作ったもの。

- 作戦板(2 人で書く): https://claude.ai/artifact/M5FwptfkwniYwNeAgiisWW (招待された人だけ)
- 20:45 までに動くものを作って、20:55 から 1 分ピッチ(スライドなし)

## 進め方

- `main` に直接 push してよい(2 人だけ。コンフリクトしたら `git pull --rebase`)
- 各自の Claude Code にこのリポジトリを clone させて、同じファイルを触るときは作戦板で一言
- mod の置き場: `mod/`(Claude Code の設定・フック・スクリプト)。説明は `mod/README.md` に

## できたもの: mod「きらり」(`mod/kirari/`)

![きらりの帯](docs/img/kirari_demo.gif)

- Claude Code が働いている間だけ、入力欄の上に紺色の帯が出る。きらり(黄)とかにちゃん(橙)が歩く。暇になると消え、1 分だれも打たないとまた出てくる
- `/kirari こんにちは` で話せる。返事のたびに、家の M5Stack ロボット「ぷちてゃ」の起きる音が鳴る(`/kirari おと` で本体の音を on/off)
- ぷちてゃの窓: でんち・たっち・よっきゅうをハートのゲージで。さわられたら success、ゆれたら shining
- 別セッション・サブエージェントからの知らせは帯に 20 秒。🔔 を押すと一覧、各行を押すと全文
- `/config` で着せ替え(kirari / kirakira / quiet)と読み上げ

### iPad のページ(`web/`)

![iPad のページ](docs/img/ipad_page.png)

- 同じ帯がページでも動く。ボタン一つ(こんにちは など)で PC のきらりに話しかけられて、返事とさわられた・ゆられたが 2 秒ごとに同期する
- 仕組み: ページ → `web/say_server.py`(127.0.0.1:8790、Tailscale Funnel の `/me/say`)→ mod が 2 秒ごとに読む。mod は帯の状態を `/state` に送り、ページが読む

### 動かし方

```
git clone https://github.com/RRYZ09/claude-build-night-2026-10.git
cd claude-build-night-2026-10
claude --plugin-dir mod/kirari
```

ぷちてゃの窓と音は、ぷちのダッシュボード(`127.0.0.1:8765`)と本体が同じネットワークにあるときだけ。無くても帯と `/kirari` は動く。
