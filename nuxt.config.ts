export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    adminToken: process.env.NUXT_ADMIN_TOKEN ?? ''
  },
  app: {
    head: {
      title: 'AION Context MCP',
      meta: [
        {
          name: 'description',
          content: 'Small MCP-backed knowledge cockpit for AION 2 research.'
        }
      ]
    }
  }
})
