export class HostError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const hostError = (error) => error instanceof HostError ? error : new HostError(error?.code ?? "HOST_INTERNAL", error?.message ?? String(error), error?.code === "HOST_UNAVAILABLE" ? 503 : 500);
