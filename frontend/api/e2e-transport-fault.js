export default function handler(request, response) {
  if (request.query?.e2e_transport_fault !== "once") {
    response.setHeader("Cache-Control", "no-store");
    return response.status(404).json({ error: "Not found" });
  }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Retry-After", "1");
  return response.status(503).json({ error: "Controlled E2E transport failure" });
}
