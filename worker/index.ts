import { getContainer } from '../infrastructure/container.js'

const pollMs = Number(process.env.WORKER_POLL_MS ?? 3000)
const { queue, knowledge } = getContainer()

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200_000)
}

async function acquire(url: string): Promise<{ title?: string; content?: string; notes?: string }> {
  const parsed = new URL(url)
  const isYouTube =
    parsed.hostname === 'youtube.com' ||
    parsed.hostname.endsWith('.youtube.com') ||
    parsed.hostname === 'youtu.be'

  if (isYouTube) {
    const endpoint = new URL('https://www.youtube.com/oembed')
    endpoint.searchParams.set('url', url)
    endpoint.searchParams.set('format', 'json')

    const response = await fetch(endpoint, {
      headers: { 'user-agent': 'aion-context-mcp/0.1' }
    })

    if (!response.ok) {
      throw new Error(`YouTube oEmbed returned ${response.status}`)
    }

    const metadata = await response.json() as {
      title?: string
      author_name?: string
    }

    return {
      title: metadata.title,
      content: '',
      notes: metadata.author_name
        ? `YouTube author: ${metadata.author_name}. Transcript not fetched by worker.`
        : 'YouTube transcript not fetched by worker.'
    }
  }

  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'aion-context-mcp/0.1' }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`)
  }

  const html = await response.text()
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)

  return {
    title: titleMatch?.[1]?.replace(/\s+/g, ' ').trim(),
    content: stripHtml(html)
  }
}

console.log(`AION acquisition worker polling every ${pollMs}ms`)

while (true) {
  const job = await queue.claimNext()

  if (!job) {
    await new Promise(resolve => setTimeout(resolve, pollMs))
    continue
  }

  try {
    const acquired = await acquire(job.payload.url)

    await knowledge.recordSource({
      kind: job.payload.url.includes('youtu') ? 'YOUTUBE' : 'WEB',
      url: job.payload.url,
      title: job.payload.title || acquired.title || job.payload.url,
      scope: job.payload.scope,
      content: job.payload.content || acquired.content || '',
      notes: [job.payload.notes, acquired.notes].filter(Boolean).join('\n') || null
    })

    await queue.complete(job.id)
    console.log(`completed acquisition ${job.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await queue.fail(job.id, message)
    console.error(`failed acquisition ${job.id}: ${message}`)
  }
}
