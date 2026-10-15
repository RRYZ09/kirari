export type Mood = 'idle' | 'busy' | 'talk'
export type Note = { id: number; at: number; from: string; text: string; isOpen: boolean }
export type Line = { who: 'you' | 'pet'; text: string }
export type PuchiEvent = { kind: 'touch' | 'shake'; at: number }
export type Sensors = { at: number; ok: boolean; ambient?: number; proximity?: number; battery?: number; shake?: number; touchAgo?: number; raw: string }

declare module 'claude-code' {
  interface PluginState {
    'kirari': { mood: Mood; frame: number; notes: Note[]; lines: Line[]; busyTask: string; sensors: Sensors | null; lastTyped: number; lastEvent: PuchiEvent | null }
  }
}
