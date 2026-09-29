import http from "node:http";

const PAGE = `<!doctype html><html><body>
<h1>Schedule</h1>
<input data-testid="note-input" aria-label="Note" />
<button data-testid="save-renamed" onclick="document.getElementById('out').textContent='Saved!'">Save</button>
<button data-testid="noop" onclick="void 0">Do nothing</button>
<button data-testid="hidden-btn" style="display:none" onclick="document.getElementById('out').textContent='Saved!'">Hidden save</button>
<div id="out"></div>
</body></html>`;

export async function startFixture(): Promise<{ host: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end(PAGE); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  return { host: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}
