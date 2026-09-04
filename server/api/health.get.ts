export default defineEventHandler(event => {
  const config = useRuntimeConfig(event)
  return {
    ok: true,
    service: 'aion-context-web',
    releaseTag: config.public.releaseTag,
    commitSha: config.public.commitSha || null
  }
})
