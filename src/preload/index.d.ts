import type { MaoxuanApi } from '../shared/api'

declare global {
  interface Window {
    api: MaoxuanApi
  }
}

export {}
