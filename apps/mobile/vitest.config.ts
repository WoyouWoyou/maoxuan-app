import { defineConfig } from 'vitest/config'
import config from './vite.config'
export default defineConfig({ resolve: config.resolve, test: { include: ['tests/*.test.ts'] } })
