export async function postJson<T>(
  origin: string,
  input: string,
  body: unknown,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')

  const response = (await fetch(new URL(input, origin), {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })) as Response

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return await response.json()
}
