export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    adminToken: process.env.NUXT_ADMIN_TOKEN ?? '',
    betaAdminDiscordIds: process.env.BETA_ADMIN_DISCORD_IDS ?? '',
    public: {
      releaseTag: process.env.NUXT_PUBLIC_RELEASE_TAG ?? 'v0.1.0',
      commitSha: process.env.NUXT_PUBLIC_COMMIT_SHA ?? ''
    }
  },
  app: {
    head: {
      title: 'AION Context MCP',
      meta: [
        {
          name: 'description',
          content: 'Reliable, source-aware AION 2 context for MCP clients.'
        }
      ]
    }
  }
})
