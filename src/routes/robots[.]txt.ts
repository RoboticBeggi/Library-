import { createFileRoute } from '@tanstack/react-router'

// Private school tool: keep it out of search engines.
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () =>
        new Response(['User-agent: *', 'Disallow: /', ''].join('\n'), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
        }),
    },
  },
})
