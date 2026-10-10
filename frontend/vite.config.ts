import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { chatApi } from './server/chatApi.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chatApi()],
})
