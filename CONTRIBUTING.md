# きらりに手を入れる

Issue も PR も歓迎です。小さな mod なので、気軽にどうぞ。

## 動かす

```bash
git clone https://github.com/RRYZ09/kirari.git
cd kirari
claude --plugin-dir mod/kirari
```

`mod/kirari/` のファイルを直すと、`--plugin-dir` で起動したセッションではターンの終わりに読み直されます。

## 直す前に

```bash
claude plugin validate mod/kirari      # 書式と、エンジンが拒むものの確認
```

型を見るなら、一度 `--plugin-dir` で読み込むと `mod/kirari/.claude-plugin/types/` に API の型が書かれます(その後 `npx -p typescript tsc -p mod/kirari`)。

## どこを触るか

| やりたいこと | 場所 |
|---|---|
| キャラを増やす・せりふを変える | `hooks/register.tsx` の先頭 `PROFILES` と `.claude-plugin/plugin.json` の `userConfig.profile.options` |
| 帯の見た目 | `hooks/register.tsx` の `ui.render` (`AbovePrompt`) |
| 出る・引っ込む条件 | 同じ `ui.render` の冒頭(`isLonely` / `userBusy` / `hasEvent`) |
| ぷちてゃ以外のロボットを窓にする | `readSensors` / `readDesires` / `PUCHI_HOSTS` / `DEVICE_SE` |
| 音 | `ring()` と `sounds/` |
| iPad のページ | `web/index.html` と `web/say_server.py` |

## 決まりごと

- 帯は 3 行まで。ペインは開かない(うるさくなるので)
- 人が打っているときは引っ込む。知らせは会話に割り込まない
- きらりは「窓」にある事実だけを話す。無いことは言わない
- 本名・鍵・URL の秘密はリポジトリに入れない(`web/media/*.mp4` も git 外)
- コミットメッセージは日本語でよい

## PR の出し方

1. fork して branch を切る
2. `claude plugin validate mod/kirari` が通ることを確認
3. 何を変えたか・どう見えるか(できれば GIF)を PR に書く
