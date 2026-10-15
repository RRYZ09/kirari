export type Mood = 'idle' | 'busy' | 'talk'
export type Note = { id: number; at: number; from: string; text: string; isOpen: boolean }
export type Line = { who: 'you' | 'pet'; text: string }

declare module 'claude-code' {
  interface PluginState {
    'puchi-pet': { mood: Mood; frame: number; notes: Note[]; lines: Line[]; busyTask: string }
  }
}
