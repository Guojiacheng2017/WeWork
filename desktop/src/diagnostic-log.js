const secretPattern = /(authorization|bearer|token|api[-_ ]?key|password|secret)/i;

export class DiagnosticLog {
  constructor(limit = 300) { this.limit = limit; this.entries = []; this.sequence = 0; }
  add(level, source, message, details) {
    const safeDetails = details && Object.fromEntries(Object.entries(details).filter(([key]) => !secretPattern.test(key)));
    const entry = { id: ++this.sequence, time: new Date().toISOString(), level, source, message: String(message).slice(0, 2000), ...(safeDetails && Object.keys(safeDetails).length ? { details: safeDetails } : {}) };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    return entry;
  }
  snapshot(status) { return { status, entries: this.entries.slice() }; }
  clear() { this.entries = []; }
}
