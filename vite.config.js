import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 導入 PostCSS 插件
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // 嵌入 Tailwind CSS 配置到 Vite (使用 ESM 語法)
  css: {
    postcss: {
      plugins: [
        tailwindcss, // 直接使用導入的模組
        autoprefixer, // 直接使用導入的模組
      ],
    },
  },
})