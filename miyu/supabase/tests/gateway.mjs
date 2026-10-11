// 로컬 검증용 경로 중계: /auth/v1 → Supabase Auth(9999), /rest/v1 → PostgREST(3000)
// 실제 Supabase의 API 게이트웨이 역할을 흉내 낸다.
import http from "node:http";

const routes = [
  { prefix: "/auth/v1", port: 9999 },
  { prefix: "/rest/v1", port: 3000 },
];

http
  .createServer((req, res) => {
    const route = routes.find((r) => req.url.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: route.port,
        path: req.url.slice(route.prefix.length) || "/",
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  })
  .listen(Number(process.env.GATEWAY_PORT ?? 54321), "127.0.0.1");
