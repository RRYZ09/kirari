import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Line, Mood, Note, Sensors } from '../types'

const PANE = 'puchi-pet'
const mood = atom({ plugin: 'puchi-pet', key: 'mood' } as const, 'idle' as Mood)
const frame = atom({ plugin: 'puchi-pet', key: 'frame' } as const, 0)
const notes = atom({ plugin: 'puchi-pet', key: 'notes' } as const, [] as Note[])
const lines = atom({ plugin: 'puchi-pet', key: 'lines' } as const, [] as Line[])
const busyTask = atom({ plugin: 'puchi-pet', key: 'busyTask' } as const, '')
const sensors = atom({ plugin: 'puchi-pet', key: 'sensors' } as const, null as Sensors | null)
// ぷちてゃ(家の M5Stack)の /sensors。応答が無ければ「寝てる」
// ダッシュボード経由(m5-petit 上)。ぷちてゃ本体の IP は変わるので直接は叩かない
const PUCHITEYA = 'http://127.0.0.1:8765/api/puchiteya/sensors'
const readSensors = async ($: Parameters<Parameters<Register>[0]>[2] extends (...a: infer A) => unknown ? A[0] : never) => {
  try {
    const r = await $.http.fetch(PUCHITEYA, { method: 'GET' })
    if (!r.ok) throw new Error(String(r.status))
    const j = JSON.parse(r.text) as Record<string, unknown>
    const shake = Math.abs((num(j.gx) ?? 0)) + Math.abs((num(j.gy) ?? 0)) + Math.abs((num(j.gz) ?? 0))
    await update($, sensors, () => ({ at: Date.now(), ok: j.online !== false, ambient: num(j.ambient), proximity: num(j.proximity), battery: num(j.battery), shake, touchAgo: num(j.touch_ago), raw: Object.keys(j).slice(0, 8).join(' ') }))
  } catch { await update($, sensors, prev => ({ at: Date.now(), ok: false, ambient: prev?.ambient, proximity: prev?.proximity, battery: prev?.battery, shake: 0, touchAgo: prev?.touchAgo, raw: prev?.raw ?? '' })) }
}
const light = (a?: number) => a === undefined ? '明るさ ?' : a > 1500 ? 'あかるい' : a > 300 ? 'ほどほど' : 'くらい'
const near = (p?: number) => p === undefined ? '近さ ?' : p > 100 ? 'だれか近くにいる' : 'まわりは静か'
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)

// 着せ替え。りんさんがここを増やす
const PROFILES: Record<string, { name: string; sprites: string[]; sparkle: string[]; idle: string[]; busy: string[]; system: string }> = {
  kirari: {
    name: 'きらり',
    sprites: ['(◕ᴗ◕)', '(◕ᴗ◕)', '(◕ᴗ◕)', '(-ᴗ-)'],
    sparkle: ['✧', '･', '✦', '｡'],
    idle: ['しずかだね', 'ここにいるよ', 'ぷちてゃの窓、のぞいてる'],
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
    await $.command.register({ name: 'pet', description: `${profile.name || 'ペット'}に話しかける(待ち時間用)。例: /pet こんにちは` })
    void $.ui.open({ id: PANE, title: profile.name ? `${profile.name} ✧` : 'pet' })
    // ペットの歩み(400ms ごとに 1 コマ)
    $.clock.every(2000, () => { void update($, frame, n => (n + 1) % 1000) })
    void readSensors($)
    $.clock.every(20000, () => { void readSensors($) })

    return next(e)
  })

  // 忙しさの判定: ターンが走っている間は busy。サブエージェントを出したら、その内容を覚える
  on('turn.start', async ($, e, next) => { await update($, mood, () => 'busy'); return next(e) })
  on('turn.complete', async ($, e, next) => { await update($, mood, () => 'idle'); await update($, busyTask, () => ''); return next(e) })
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
  on('command.run', { command: 'pet' }, async ($, e) => {
    const said = String(e.args ?? '').trim()
    if (!said) { await $.ui.open({ id: PANE, title: profile.name ? `${profile.name} ✧` : 'pet' }); return { text: `${profile.name} のペインを開いたよ。/pet <ことば> で話せる` } }
    await update($, lines, l => [...l, { who: 'you', text: said } as Line].slice(-12))
    await update($, mood, () => 'talk')
    let reply = ''
    try {
      const sn = await read($, sensors)
      const window = sn?.ok ? `(いまのぷちてゃの窓: ${light(sn.ambient)}、${near(sn.proximity)}、電池 ${sn.battery ?? '?'}%${(sn.shake ?? 0) > 1 ? '、ゆれている' : ''}${(sn.touchAgo ?? 99) < 10 ? '、さっき誰かにさわられた' : ''})` : '(ぷちてゃはいま寝ているみたい)'
      const r = await $.model.complete({ model: 'claude-haiku-4-5-20251001', system: profile.system + ' ' + window, prompt: said, maxTokens: 120 })
      reply = r.text.trim()
    } catch { reply = profile.busy[0] ?? '…' }
    await update($, lines, l => [...l, { who: 'pet', text: reply } as Line].slice(-12))
    await update($, mood, () => 'idle')
    if (wantsVoice) { try { await $.audio.speak(reply) } catch { /* 読み上げが無い環境 */ } }
    return { text: `${profile.name}「${reply}」` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [m, f, ns, ls, task, sn] = await Promise.all([read($, mood), read($, frame), read($, notes), read($, lines), read($, busyTask), read($, sensors)])
    const cols = Math.max(20, (e.viewport?.columns ?? 40) - 2)
    const sprite = profile.sprites[f % profile.sprites.length]
    // 左右にゆっくり歩く
    const span = Math.max(1, cols - sprite.length - 2)
    const t = (m === 'busy' ? Math.floor(f / 4) : f) % (span * 2)
    const x = t < span ? t : span * 2 - t
    const sp = (i: number) => profile.sparkle[(f + i) % profile.sparkle.length]
    const walk = ' '.repeat(x) + sprite
    const sf = Math.floor(f / 5)
    const stars = Array.from({ length: Math.min(4, Math.floor(cols / 8)) }, (_, i) => ' '.repeat(((sf * 5 + i * 11) % cols)).slice(0, cols) + sp(i)).join('\n')
    const hint = m === 'busy'
      ? `${profile.name}: ${profile.busy[f % Math.max(1, profile.busy.length)] ?? ''}${task ? `  (まかせてる: ${task})` : ''}`
      : m === 'talk' ? `${profile.name}: …かんがえ中` : (profile.idle[Math.floor(f / 25) % Math.max(1, profile.idle.length)] ?? '')

    return (
      <Box flexDirection="column">
        <Text dimColor>{stars.split('\n')[sf % 2] ?? ''}</Text>
        <Text>{walk}</Text>
        <Text dimColor>{hint}</Text>
        <Text dimColor>{sn ? (sn.ok ? `ぷちてゃの窓: ${light(sn.ambient)} ・ ${near(sn.proximity)} ・ 電池 ${sn.battery ?? '?'}%${(sn.shake ?? 0) > 1 ? ' ・ ゆれてる!' : ''}${(sn.touchAgo ?? 99) < 10 ? ' ・ さわられた' : ''}` : 'ぷちてゃの窓: いまは寝てる') : 'ぷちてゃの窓: …'}</Text>
        <Text dimColor>{m === 'busy' ? '待ち時間。/pet <ことば> で話せる' : '/pet <ことば>'}</Text>
        {ls.length > 0 && <Text dimColor>──</Text>}
        {ls.slice(-6).map(l => (
          <Text dimColor={l.who === 'you'}>{l.who === 'you' ? 'あなた: ' : `${profile.name}: `}{l.text}</Text>
        ))}
        {ns.length > 0 && <Text dimColor>── 知らせ {ns.length}</Text>}
        {ns.slice(0, 5).map(n => (
          <Box flexDirection="column">
            <Button key={`n${n.id}`} label={`${n.isOpen ? '▾' : '▸'} ${n.from}: ${n.text.replace(/\s+/g, ' ').slice(0, Math.max(10, cols - 14))}`}
              onPress={() => update($, notes, list => list.map(x => (x.id === n.id ? { ...x, isOpen: !x.isOpen } : x)))} />
            {n.isOpen && <Text>{n.text}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
