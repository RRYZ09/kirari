import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Desire, Line, Mood, Note, PuchiEvent, Sensors } from '../types'

const mood = atom({ plugin: 'kirari', key: 'mood' } as const, 'idle' as Mood)
const frame = atom({ plugin: 'kirari', key: 'frame' } as const, 0)
const notes = atom({ plugin: 'kirari', key: 'notes' } as const, [] as Note[])
const lines = atom({ plugin: 'kirari', key: 'lines' } as const, [] as Line[])
const busyTask = atom({ plugin: 'kirari', key: 'busyTask' } as const, '')
const sensors = atom({ plugin: 'kirari', key: 'sensors' } as const, null as Sensors | null)
const lastTyped = atom({ plugin: 'kirari', key: 'lastTyped' } as const, 0)
const lastEvent = atom({ plugin: 'kirari', key: 'lastEvent' } as const, null as PuchiEvent | null)
const desires = atom({ plugin: 'kirari', key: 'desires' } as const, [] as Desire[])
const inboxOpen = atom({ plugin: 'kirari', key: 'inboxOpen' } as const, false)
const pinUntil = atom({ plugin: 'kirari', key: 'pinUntil' } as const, 0)
const SAY_INBOX = 'http://127.0.0.1:8790/inbox'   // web/say_server.py(iPad からの言葉)
const SAY_STATE = 'http://127.0.0.1:8790/state'   // 帯の状態を iPad のページへ
const pushState = async ($: Dollar) => {
  try {
    const [m, ls, sn, ds, ev] = await Promise.all([read($, mood), read($, lines), read($, sensors), read($, desires), read($, lastEvent)])
    const evAge = ev ? Math.round((Date.now() - ev.at) / 1000) : 999
    const evSay = ev && evAge < 30 ? (ev.kind === 'touch' ? 'ぷちてゃ、さわられたって!' : 'ぷちてゃ、ゆられてる!') : ''
    const last = ls.length ? ls[ls.length - 1] : null
    const l2 = evSay || (last && last.who === 'pet' ? last.text : '')
    const win = sn ? (sn.ok ? `でんち ${bar((sn.battery ?? 0) / 100)} ${battWord(sn.battery)} ・ たっち ${touchWord(sn.touchAgo)}${(sn.shake ?? 0) > 3 ? ' ・ ゆれてる!' : ''}` : 'いまは寝てる') : '…'
    const want = ds.length ? ` ・ よっきゅう ${ds.map(d => `${d.label} ${bar(d.v, 3)}`).join(' ')}` : ''
    await $.http.fetch(SAY_STATE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mood: m, l2, l3: `ぷちてゃ: ${win}${want}`, event: ev && evAge < 30 ? ev.kind : '', you: last && last.who === 'you' ? last.text : '' }) })
  } catch { /* 受け口が無い */ }
}
let saySeen = 0
let sayBusy = false   // /kirari だけ打つと 3 分出しっぱなし
const PUCHI_HOSTS = ['192.168.8.101', '192.168.1.14', 'puchiteya.local']
let lastRingAt = 0
const RING_GAP_MS = 60000   // 本体の音は 1 分に 1 回まで
let puchiHost = ''   // ぷちてゃ本体の、いま届くアドレス(無ければ '')
type Dollar = Parameters<Parameters<Register>[0]>[2] extends (...a: infer A) => unknown ? A[0] : never
const findPuchi = async ($: Dollar) => {
  for (const h of PUCHI_HOSTS) {
    try { const r = await $.http.fetch(`http://${h}/status`, { method: 'GET' }); if (r.ok) { puchiHost = h; return } } catch { /* 次へ */ }
  }
  puchiHost = ''
}
// 本体で鳴らす。本体に届かないときは PC の音(小さい)で代える
const DEVICE_SE: Record<'kira' | 'poko' | 'shine', string> = { kira: 'wakeup.wav', poko: 'success.wav', shine: 'shining.wav' }
const ring = async ($: Dollar, name: 'kira' | 'poko' | 'shine') => {
  if (name !== 'kira') { if (Date.now() - lastRingAt < RING_GAP_MS) return; lastRingAt = Date.now() }
  if (PUCHI_SOUND && puchiHost) { try { await $.http.fetch(`http://${puchiHost}/se_play?name=${DEVICE_SE[name]}`, { method: 'GET' }); return } catch { /* 落ちたら PC */ } }
  void $.audio.play({ asset: `sounds/${name === 'shine' ? 'kira' : name}.wav` }).catch(() => {})
}
const STATUS = 'http://127.0.0.1:8765/api/puchiteya/status'
const readDesires = async ($: Dollar) => {
  try {
    const r = await $.http.fetch(STATUS, { method: 'GET' })
    if (!r.ok) return
    const j = JSON.parse(r.text) as { desires?: { desires?: Record<string, number>; labels?: Record<string, string> } }
    const v = j.desires?.desires ?? {}; const L = j.desires?.labels ?? {}
    const top = Object.entries(v).sort((a, b) => b[1] - a[1]).filter(([, x]) => x >= 0.5).slice(0, 2).map(([k, x]) => ({ label: (L[k] ?? k).replace('ありさんに会いたい', 'あいたい').replace('記録したい', 'きろく').replace('眠い', 'ねむい'), v: x }))
    await update($, desires, () => top)
  } catch { /* ダッシュボードが居ないときは前の値のまま */ }
}
const QUIET_MS = 60000   // 人が 1 分打たないと、きらりが出てくる
// ぷちてゃ(家の M5Stack)の /sensors。応答が無ければ「寝てる」
// ダッシュボード経由(m5-petit 上)。ぷちてゃ本体の IP は変わるので直接は叩かない
const PUCHITEYA = 'http://127.0.0.1:8765/api/puchiteya/sensors'
const readSensors = async ($: Dollar) => {
  try {
    const r = await $.http.fetch(PUCHITEYA, { method: 'GET' })
    if (!r.ok) throw new Error(String(r.status))
    const j = JSON.parse(r.text) as Record<string, unknown>
    const shake = Math.abs((num(j.gx) ?? 0)) + Math.abs((num(j.gy) ?? 0)) + Math.abs((num(j.gz) ?? 0))
    const touchAgo = num(j.touch_ago)
    const prev = await read($, sensors)
    await update($, sensors, () => ({ at: Date.now(), ok: j.online !== false, ambient: num(j.ambient), proximity: num(j.proximity), battery: num(j.battery), shake, touchAgo, raw: Object.keys(j).slice(0, 8).join(' ') }))
    // さわられた(前回は触られていなかった → 今回 10 秒以内): ぽこっ + 一言
    const wasTouched = (prev?.touchAgo ?? 99) < 10
    if ((touchAgo ?? 99) < 10 && !wasTouched) {
      void ring($, 'poko')
      await update($, lastEvent, () => ({ kind: 'touch', at: Date.now() }))
    }
    // 揺れた: きらっ
    if (shake > 3 && (prev?.shake ?? 0) <= 3) {
      void ring($, 'shine')
      await update($, lastEvent, () => ({ kind: 'shake', at: Date.now() }))
    }
  } catch { await update($, sensors, prev => ({ at: Date.now(), ok: false, ambient: prev?.ambient, proximity: prev?.proximity, battery: prev?.battery, shake: 0, touchAgo: prev?.touchAgo, raw: prev?.raw ?? '' })) }
}
const bar = (v: number, n = 5) => { const k = Math.max(0, Math.min(n, Math.round(v * n))); return '♥'.repeat(k) + '♡'.repeat(n - k) }
const battWord = (b?: number) => b === undefined ? '?' : b >= 70 ? 'おおめ' : b >= 35 ? 'はんぶん' : 'すくなめ'
const touchWord = (t?: number) => t === undefined ? '?' : t < 60 ? 'さっき' : t < 600 ? 'ちょっとまえ' : t < 3600 ? `${Math.round(t / 60)} 分まえ` : 'ずっとまえ'
const light = (a?: number) => a === undefined ? '明るさ ?' : a > 1500 ? 'あかるい' : a > 300 ? 'ほどほど' : 'くらい'
const near = (p?: number) => p === undefined ? '近さ ?' : p > 100 ? 'だれか近くにいる' : 'まわりは静か'
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)

// 着せ替え。りんさんがここを増やす
const PROFILES: Record<string, { name: string; sprites: string[]; sparkle: string[]; idle: string[]; busy: string[]; system: string }> = {
  kirari: {
    name: 'きらり',
    sprites: ['(｡•ᴗ•｡)', '(｡•ᴗ•｡)', '(｡•ᴗ•｡)', '(｡-ᴗ-｡)', '(｡•ᴗ•｡)', '(｡◕ᴗ◕｡)'],
    sparkle: ['✧', '･ﾟ', '✦', '｡', '♡', '✧'],
    idle: ['しずかだね', 'ここにいるよ', 'ぷちてゃの窓、のぞいてる', 'ひとやすみ?', 'おちゃ、のむ?'],
    busy: ['むずかしいの、まかせてるんだね。待ってる間、話そ?', 'きょう、なにしたの?', 'ゆっくりでいいよ'],
    system: 'あなたは「きらり」。ターミナルに住む小さな光の子。ありさんの家の M5Stack に住むロボット「ぷちてゃ」とは別の存在だが、ぷちてゃのセンサー(明るさ・近さ・電池)を窓のようにのぞける。口調はやわらかくて短い。ひらがな多め。1〜2 文で返す。相手は作業の待ち時間に話しかけている。無理に役に立とうとしない。ぷちてゃの様子は、あとに書かれた「窓」の事実だけを使い、書かれていないこと(明るさ・音・人の有無など)は言わない。窓が無ければ「いまは見えない」と言う。',
  },
  kirakira: {
    name: 'きらきら',
    sprites: ['☆', '✦', '✧', '✦', '★'],
    sparkle: ['･', 'ﾟ', '✧', '*', '｡'],
    idle: ['……(光っている)'],
    busy: ['待ち時間だよ。深呼吸しよ'],
    system: 'あなたは星のかけら。ひとこと(10 文字以内)しか言わない。',
  },
  quiet: { name: '', sprites: ['·'], sparkle: [' '], idle: [], busy: [], system: '短く、静かに答える。' },
}

let PROF = PROFILES.kirari!
let VOICE = false
let PUCHI_SOUND = true   // /config の「ぷちてゃで鳴らす」。/kirari おと でも切り替え
// きらりに話す。コマンド(/kirari)からも、iPad(web の受け口)からも同じ
const talk = async ($: Dollar, said: string, from: 'you' | 'ipad') => {
const profile = PROF
const wantsVoice = VOICE
  await update($, lastTyped, () => Date.now())
  await update($, lines, l => [...l, { who: 'you', text: (from === 'ipad' ? '(iPad) ' : '') + said } as Line].slice(-12))
  await update($, mood, () => 'talk')
  if (from === 'ipad') await update($, pinUntil, () => Date.now() + 60000)
  let reply = ''
  try {
    const sn = await read($, sensors)
    const window = sn?.ok ? `(いまのぷちてゃの窓: 明るさは${light(sn.ambient)}(${sn.ambient ?? '?'})、${near(sn.proximity)}、電池 ${sn.battery ?? '?'}%、最後にさわられたのは ${sn.touchAgo ?? '?'} 秒前${(sn.shake ?? 0) > 1 ? '、ゆれている' : ''}${(sn.touchAgo ?? 99) < 10 ? '、さっき誰かにさわられた' : ''})` : '(ぷちてゃはいま寝ているみたい)'
    const ds0 = await read($, desires)
    const want = ds0.length ? `(ぷちてゃのいまの気持ち: ${ds0.map(d => d.label).join('、')})` : ''
    const r = await $.model.complete({ model: 'claude-haiku-4-5-20251001', system: profile.system + ' ' + window + want, prompt: said, maxTokens: 120 })
    reply = r.isAnswered ? r.text.trim() : (profile.busy[0] ?? '…')
  } catch { reply = profile.busy[0] ?? '…' }
  await update($, lines, l => [...l, { who: 'pet', text: reply } as Line].slice(-12))
  void ring($, 'kira')   // きらっ(ぷちてゃ本体で)
  await update($, mood, () => 'idle')
  if (wantsVoice) { try { await $.audio.speak(reply) } catch { /* 読み上げが無い環境 */ } }
  return reply
}


export const register: Register = (on, options) => {
  const profile = (PROFILES[String((options as { profile?: string }).profile ?? 'kirari')] ?? PROFILES.kirari)!
  const wantsVoice = Boolean((options as { voice?: boolean }).voice)
  PROF = profile; VOICE = wantsVoice
  PUCHI_SOUND = (options as { puchi_sound?: boolean }).puchi_sound !== false
  let noteSeq = 1

  on('session.start', async ($, e, next) => {
    void $.ui.close({ id: 'puchi-pet' }).catch(() => {})   // 前の版が開いたペインを片付ける
    await $.command.register({ name: 'kirari', description: `${profile.name || 'きらり'}に話しかける(待ち時間用)。例: /kirari こんにちは` })
    // ペットの歩み(400ms ごとに 1 コマ)
    $.clock.every(700, () => { void update($, frame, n => (n + 1) % 100000) })
    void findPuchi($)
    $.clock.every(120000, () => { void findPuchi($) })
    void readSensors($)
    $.clock.every(10000, () => { void readSensors($) })
    void readDesires($)
    $.clock.every(60000, () => { void readDesires($) })
    // 起動時点より前の言葉は読まない
    try { const r0 = await $.http.fetch(SAY_INBOX + '?since=0', { method: 'GET' }); const j0 = JSON.parse(r0.text) as { items: { id: number }[] }; saySeen = j0.items.length ? j0.items[j0.items.length - 1]!.id : 0 } catch { /* 受け口が無い */ }
    $.clock.every(2000, () => { void pushState($) })
    $.clock.every(2000, () => { void (async () => {
      if (sayBusy) return
      try {
        const r = await $.http.fetch(`${SAY_INBOX}?since=${saySeen}`, { method: 'GET' })
        const j = JSON.parse(r.text) as { items: { id: number; text: string }[] }
        for (const it of j.items) { saySeen = Math.max(saySeen, it.id); sayBusy = true; try { await talk($, it.text, 'ipad') } finally { sayBusy = false } }
      } catch { /* 受け口が無いときは黙る */ }
    })() })

    return next(e)
  })

  // 忙しさの判定: ターンが走っている間は busy。サブエージェントを出したら、その内容を覚える
  on('prompt.change', async ($, e, next) => { await update($, lastTyped, () => Date.now()); return next(e) })
  on('prompt.submit', async ($, e, next) => { await update($, lastTyped, () => Date.now()); return next(e) })
  on('turn.start', async ($, e, next) => { await update($, mood, () => 'busy'); return next(e) })
  on('turn.complete', async ($, e, next) => { await update($, mood, () => 'idle'); await update($, busyTask, () => ''); await update($, lastTyped, () => Date.now()); return next(e) })
  on('agent.spawn', async ($, e, next) => {
    const head = String((e as { prompt?: string }).prompt ?? '').split('\n')[0].slice(0, 40)
    await update($, busyTask, () => head)
    return next(e)
  })

  // よそからの知らせ: 右上にトースト、ペインに積む。会話には割り込ませない(模型には渡す)
  on('session.receive', async ($, e, next) => {
    const kind = String((e.origin as { kind?: string }).kind ?? 'unclassified')
    if (kind !== 'bridge') {
      const head = e.text.replace(/\s+/g, ' ').slice(0, 60)
      const note: Note = { id: noteSeq++, at: await $.clock.now(), from: kind, text: e.text.slice(0, 600), isOpen: false }
      await update($, notes, list => [note, ...list].slice(0, 20))
    }
    return next(e)
  })

  // /pet こんにちは → ペットが短く返す(忙しくても暇でも答えるが、暇なときは一言だけ)
  on('command.run', { command: 'kirari' }, async ($, e) => {
    const said = String(e.args ?? '').trim()
    if (said === 'おと' || said === 'sound') { PUCHI_SOUND = !PUCHI_SOUND; return { text: PUCHI_SOUND ? 'ぷちてゃで鳴らすよ' : 'ぷちてゃでは鳴らさない(PC の小さい音だけ)' } }
    if (!said) { const isPinned = (await read($, pinUntil)) > Date.now(); await update($, pinUntil, () => (isPinned ? 0 : Date.now() + 180000)); return { text: isPinned ? `${profile.name} を引っ込めたよ` : `${profile.name} を 3 分出しておくね。/kirari <ことば> で話せる。もう一度 /kirari で引っ込む。/kirari おと で音の切り替え` } }
    const reply = await talk($, said, 'you')
    return { text: `${profile.name}「${reply}」` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
   try {
    const m = await read($, mood)
    const quietFor = Date.now() - (await read($, lastTyped))
    const isLonely = m === 'idle' && quietFor > QUIET_MS
    const ev0 = await read($, lastEvent)
    const ns0 = await read($, notes)
    // 人が打っているときは、出来事や知らせがあっても 10 秒で引っ込む(開いた一覧だけは残す)
    const userBusy = quietFor < 10000
    const hasNote = !userBusy && ns0.some(n => Date.now() - n.at < 20000)
    const hasEvent = (!userBusy && !!ev0 && Date.now() - ev0.at < 30000) || hasNote || (await read($, inboxOpen)) || (await read($, pinUntil)) > Date.now()
    if ((m === 'idle' && !isLonely && !hasEvent) || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const sp = (i: number) => profile.sparkle[i % profile.sparkle.length]
    const [f, ls, task, sn, ns, ev, ds] = await Promise.all([read($, frame), read($, lines), read($, busyTask), read($, sensors), read($, notes), read($, lastEvent), read($, desires)])
    const isOpen = await read($, inboxOpen)
    const cols = Math.max(20, (e.viewport?.columns ?? 60) - 2)
    const evAge = ev ? Math.round((Date.now() - ev.at) / 1000) : 999
    const fresh = ns.find(n => Date.now() - n.at < 20000)
    const noteSay = fresh ? `🔔 ${fresh.from}: ${fresh.text.replace(/\s+/g, ' ').slice(0, Math.max(10, cols - 14))}` : ''
    const evSay = ev && evAge < 30 ? (ev.kind === 'touch' ? 'ぷちてゃ、さわられたって! ' + sp(f) : 'ぷちてゃ、ゆられてる! ' + sp(f)) : ''
    const sprite = profile.sprites[f % profile.sprites.length]
    const span = Math.max(1, cols - sprite.length - 2)
    const t = f % (span * 2)
    const x = t < span ? t : span * 2 - t
    const last = ls.length ? ls[ls.length - 1] : null
    // かにちゃん(Anthropic 風の橙のかに)は逆向きに横歩き。近づくと一緒に遊ぶ
    const crab = f % 10 === 7 ? 'V[ ▬  ▬ ]V' : 'V[ ■  ■ ]V'   // ありさんのかにちゃん。たまに瞬き
    const spanC = Math.max(1, cols - crab.length - 2)
    const tc = Math.floor(f * 0.8 + 17) % (spanC * 2)
    const xc = spanC - (tc < spanC ? tc : spanC * 2 - tc)
    const together = Math.abs(xc - x) < 6
    const playSay = together && f % 4 < 2 ? 'かにちゃんとあそんでる! ' + sp(f) : ''
    const say = m === 'talk' ? '…かんがえ中' : playSay ? playSay : isLonely ? (profile.idle[Math.floor(f / 20) % Math.max(1, profile.idle.length)] ?? '') : (profile.busy[Math.floor(f / 20) % Math.max(1, profile.busy.length)] ?? '')
    const kira = sp(f + 3) + sprite + sp(f) + (evAge < 30 ? '♡' : '')
    const left = Math.min(x, xc), right = Math.max(x, xc)
    const first = x <= xc ? kira : crab, second = x <= xc ? crab : kira
    const gap = Math.max(0, right - left - first.length)
    const play = together ? (f % 2 ? '♡✧' : '✧♡') : ''
    const mid = together ? play.padStart(Math.max(gap, play.length)) : ' '.repeat(gap)
    const firstIsKira = x <= xc
    const win = sn ? (sn.ok
      ? `でんち ${bar((sn.battery ?? 0) / 100)} ${battWord(sn.battery)} ・ たっち ${touchWord(sn.touchAgo)}${(sn.shake ?? 0) > 3 ? ' ・ ゆれてる!' : ''}`
      : 'いまは寝てる') : '…'
    const want = ds.length ? ` ・ よっきゅう ${ds.map(d => `${d.label} ${bar(d.v, 3)}`).join(' ')}` : ''

    return (
      <Box flexDirection="column" backgroundColor="#14213d" paddingX={1}>
        <Box flexDirection="row">
          <Text backgroundColor="#14213d" color={firstIsKira ? '#ffe66d' : '#ff8c42'}>{' '.repeat(left) + first}</Text>
          <Text backgroundColor="#14213d" color="#ffb3d9">{mid}</Text>
          <Text backgroundColor="#14213d" color={firstIsKira ? '#ff8c42' : '#ffe66d'}>{second}</Text>
        </Box>
        <Text backgroundColor="#14213d" color="#ffd6e7">{profile.name ? ` ${profile.name} ✧ ${noteSay || evSay || (last && last.who === 'pet' ? last.text : say)}` : ''}</Text>
        <Text backgroundColor="#14213d" color="#a8d8ff">{task ? ` まかせてる: ${task}  ` : ' '}ぷちてゃ: {win}{want}</Text>
        {ns.length > 0 && (
          <Box>
            <Button key="inbox" label={`🔔 ${ns.length} ${isOpen ? '▾ とじる' : '▸ みる'}`} onPress={() => update($, inboxOpen, v => !v)} />
          </Box>
        )}
        {isOpen && ns.slice(0, 5).map(n => (
          <Box flexDirection="column">
            <Button key={`n${n.id}`} label={`${n.isOpen ? '▾' : '▸'} ${n.from}: ${n.text.replace(/\s+/g, ' ').slice(0, Math.max(10, cols - 16))}`}
              onPress={() => update($, notes, list => list.map(x => (x.id === n.id ? { ...x, isOpen: !x.isOpen } : x)))} />
            {n.isOpen && <Text backgroundColor="#14213d" color="#e8ecf5">{n.text}</Text>}
          </Box>
        ))}
      </Box>
    )
   } catch { return next(e) }
  })
}
