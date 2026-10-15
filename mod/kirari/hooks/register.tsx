import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Line, Mood, Note, PuchiEvent, Sensors } from '../types'

const mood = atom({ plugin: 'kirari', key: 'mood' } as const, 'idle' as Mood)
const frame = atom({ plugin: 'kirari', key: 'frame' } as const, 0)
const notes = atom({ plugin: 'kirari', key: 'notes' } as const, [] as Note[])
const lines = atom({ plugin: 'kirari', key: 'lines' } as const, [] as Line[])
const busyTask = atom({ plugin: 'kirari', key: 'busyTask' } as const, '')
const sensors = atom({ plugin: 'kirari', key: 'sensors' } as const, null as Sensors | null)
const lastTyped = atom({ plugin: 'kirari', key: 'lastTyped' } as const, 0)
const lastEvent = atom({ plugin: 'kirari', key: 'lastEvent' } as const, null as PuchiEvent | null)
const desires = atom({ plugin: 'kirari', key: 'desires' } as const, [] as string[])
const STATUS = 'http://127.0.0.1:8765/api/puchiteya/status'
const readDesires = async ($: Parameters<Parameters<Register>[0]>[2] extends (...a: infer A) => unknown ? A[0] : never) => {
  try {
    const r = await $.http.fetch(STATUS, { method: 'GET' })
    if (!r.ok) return
    const j = JSON.parse(r.text) as { desires?: { desires?: Record<string, number>; labels?: Record<string, string> } }
    const v = j.desires?.desires ?? {}; const L = j.desires?.labels ?? {}
    const top = Object.entries(v).sort((a, b) => b[1] - a[1]).filter(([, x]) => x >= 0.7).slice(0, 2).map(([k]) => L[k] ?? k)
    await update($, desires, () => top)
  } catch { /* ダッシュボードが居ないときは前の値のまま */ }
}
const QUIET_MS = 60000   // 人が 1 分打たないと、きらりが出てくる
// ぷちてゃ(家の M5Stack)の /sensors。応答が無ければ「寝てる」
// ダッシュボード経由(m5-petit 上)。ぷちてゃ本体の IP は変わるので直接は叩かない
const PUCHITEYA = 'http://127.0.0.1:8765/api/puchiteya/sensors'
const readSensors = async ($: Parameters<Parameters<Register>[0]>[2] extends (...a: infer A) => unknown ? A[0] : never) => {
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
      void $.audio.play({ asset: 'sounds/poko.wav' }).catch(() => {})
      $.ui.toast('ぷちてゃ、さわられたって', { timeoutMs: 3000 })
      await update($, lastEvent, () => ({ kind: 'touch', at: Date.now() }))
    }
    // 揺れた: きらっ
    if (shake > 1 && (prev?.shake ?? 0) <= 1) {
      void $.audio.play({ asset: 'sounds/kira.wav' }).catch(() => {})
      await update($, lastEvent, () => ({ kind: 'shake', at: Date.now() }))
    }
  } catch { await update($, sensors, prev => ({ at: Date.now(), ok: false, ambient: prev?.ambient, proximity: prev?.proximity, battery: prev?.battery, shake: 0, touchAgo: prev?.touchAgo, raw: prev?.raw ?? '' })) }
}
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
    system: 'あなたは「きらり」。ターミナルに住む小さな光の子。ありさんの家の M5Stack に住むロボット「ぷちてゃ」とは別の存在だが、ぷちてゃのセンサー(明るさ・近さ・電池)を窓のようにのぞける。口調はやわらかくて短い。ひらがな多め。1〜2 文で返す。相手は作業の待ち時間に話しかけている。無理に役に立とうとしない。',
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

export const register: Register = (on, options) => {
  const profile = PROFILES[String((options as { profile?: string }).profile ?? 'kirari')] ?? PROFILES.kirari
  const wantsVoice = Boolean((options as { voice?: boolean }).voice)
  let noteSeq = 1

  on('session.start', async ($, e, next) => {
    void $.ui.close({ id: 'puchi-pet' }).catch(() => {})   // 前の版が開いたペインを片付ける
    await $.command.register({ name: 'kirari', description: `${profile.name || 'きらり'}に話しかける(待ち時間用)。例: /kirari こんにちは` })
    // ペットの歩み(400ms ごとに 1 コマ)
    $.clock.every(700, () => { void update($, frame, n => (n + 1) % 100000) })
    void readSensors($)
    $.clock.every(10000, () => { void readSensors($) })
    void readDesires($)
    $.clock.every(60000, () => { void readDesires($) })

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
      $.ui.toast(`🔔 ${kind}: ${head}`, { timeoutMs: 6000 })
    }
    return next(e)
  })

  // /pet こんにちは → ペットが短く返す(忙しくても暇でも答えるが、暇なときは一言だけ)
  on('command.run', { command: 'kirari' }, async ($, e) => {
    const said = String(e.args ?? '').trim()
    if (!said) return { text: `/kirari <ことば> で ${profile.name} に話せるよ(Claude が働いている間だけ、入力欄の上に出てくる)` }
    await update($, lastTyped, () => Date.now())
    await update($, lines, l => [...l, { who: 'you', text: said } as Line].slice(-12))
    await update($, mood, () => 'talk')
    let reply = ''
    try {
      const sn = await read($, sensors)
      const window = sn?.ok ? `(いまのぷちてゃの窓: ${light(sn.ambient)}、${near(sn.proximity)}、電池 ${sn.battery ?? '?'}%${(sn.shake ?? 0) > 1 ? '、ゆれている' : ''}${(sn.touchAgo ?? 99) < 10 ? '、さっき誰かにさわられた' : ''})` : '(ぷちてゃはいま寝ているみたい)'
      const ds0 = await read($, desires)
      const want = ds0.length ? `(ぷちてゃのいまの気持ち: ${ds0.join('、')})` : ''
      const r = await $.model.complete({ model: 'claude-haiku-4-5-20251001', system: profile.system + ' ' + window + want, prompt: said, maxTokens: 120 })
      reply = r.text.trim()
    } catch { reply = profile.busy[0] ?? '…' }
    await update($, lines, l => [...l, { who: 'pet', text: reply } as Line].slice(-12))
    void $.audio.play({ asset: 'sounds/kira.wav' }).catch(() => {})   // きらっ
    await update($, mood, () => 'idle')
    if (wantsVoice) { try { await $.audio.speak(reply) } catch { /* 読み上げが無い環境 */ } }
    return { text: `${profile.name}「${reply}」` }
  })

  // Claude が働いている間だけ、入力欄の上に 2〜3 行。暇なときは何も出さない
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, mood)
    const quietFor = Date.now() - (await read($, lastTyped))
    const isLonely = m === 'idle' && quietFor > QUIET_MS
    const ev0 = await read($, lastEvent)
    const hasEvent = !!ev0 && Date.now() - ev0.at < 90000
    if ((m === 'idle' && !isLonely && !hasEvent) || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const sp = (i: number) => profile.sparkle[i % profile.sparkle.length]
    const [f, ls, task, sn, ns, ev, ds] = await Promise.all([read($, frame), read($, lines), read($, busyTask), read($, sensors), read($, notes), read($, lastEvent), read($, desires)])
    const evAge = ev ? Math.round((Date.now() - ev.at) / 1000) : 999
    const evSay = ev && evAge < 90 ? (ev.kind === 'touch' ? 'ぷちてゃ、さわられたって! ' + sp(f) : 'ぷちてゃ、ゆられてる! ' + sp(f)) : ''
    const cols = Math.max(20, (e.viewport?.columns ?? 60) - 2)
    const sprite = profile.sprites[f % profile.sprites.length]
    const span = Math.max(1, cols - sprite.length - 2)
    const t = f % (span * 2)
    const x = t < span ? t : span * 2 - t
    const say = m === 'talk' ? '…かんがえ中' : isLonely ? (profile.idle[Math.floor(f / 20) % Math.max(1, profile.idle.length)] ?? '') : (profile.busy[Math.floor(f / 20) % Math.max(1, profile.busy.length)] ?? '')
    const last = ls.length ? ls[ls.length - 1] : null
    const win = sn ? (sn.ok ? `${light(sn.ambient)} ・ ${near(sn.proximity)} ・ 電池 ${sn.battery ?? '?'}%${(sn.shake ?? 0) > 1 ? ' ・ ゆれてる!' : ''}${(sn.touchAgo ?? 9999) < 180 ? ` ・ ${sn.touchAgo} 秒前にさわられた` : ''}` : 'いまは寝てる') : '…'

    return (
      <Box flexDirection="column" backgroundColor="#14213d" paddingX={1}>
        <Text backgroundColor="#14213d" color="#ffe66d">{' '.repeat(x) + sp(f + 3) + sprite + sp(f) + (evAge < 90 ? ' ♡' : '')}</Text>
        <Text backgroundColor="#14213d" color="#ffd6e7">{profile.name ? ` ${profile.name} ✧ ${evSay || (last && last.who === 'pet' ? last.text : say)}` : ''}</Text>
        <Text backgroundColor="#14213d" color="#a8d8ff">{task ? ` まかせてる: ${task}  ` : ' '}ぷちてゃ: {win}{ds.length ? `  いま「${ds.join('」「')}」` : ''}{ns.length ? `  🔔 ${ns.length}` : ''}</Text>
      </Box>
    )
  })
}
