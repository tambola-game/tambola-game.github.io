/* Registry of issued tickets: enforces uniqueness (whole ticket and every row) and serialises to JSON. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./ticket.js') : root.TambolaTicket, isNode ? require('./rng.js') : root.TambolaRng);
  if (isNode) module.exports = api;
  else root.TambolaRegistry = api;
})(typeof self !== 'undefined' ? self : this, function (Ticket, Rng) {
  'use strict';

  const VERSION = 1;
  const MAX_ATTEMPTS = 2000;

  class Registry {
    constructor() { this.reset(); }

    reset() {
      this.rev = 0;
      this.serialCounter = 0;
      this.nextPersonId = 1;
      this.people = [];
      this.tickets = [];
      this.uploads = [];
      this._ticketKeys = new Set();
      this._rowKeys = new Set();
    }

    get ticketCount() { return this.tickets.length; }

    // ---- people ----
    findPersonByKey(key) { return this.people.find(function (p) { return p.key === key; }) || null; }
    findPersonByNameKey(nameKey) { return this.people.find(function (p) { return p.nameKey === nameKey; }) || null; }

    ensurePerson(key, nameKey, name) {
      let p = this.findPersonByKey(key);
      if (!p && key.charAt(0) === 'n') p = this.findPersonByNameKey(nameKey);
      if (!p) {
        p = { id: this.nextPersonId++, key: key, nameKey: nameKey, name: name };
        this.people.push(p);
      }
      return p;
    }

    ticketsOf(personId) {
      return this.tickets.filter(function (t) { return t.personId === personId; });
    }

    // ---- uniqueness ----
    isUnique(grid) {
      if (this._ticketKeys.has(Ticket.ticketKey(grid))) return false;
      const rks = Ticket.rowKeys(grid);
      for (let i = 0; i < rks.length; i++) if (this._rowKeys.has(rks[i])) return false;
      return true;
    }

    _index(grid) {
      this._ticketKeys.add(Ticket.ticketKey(grid));
      Ticket.rowKeys(grid).forEach(function (k) { this._rowKeys.add(k); }, this);
    }

    generateUniqueGrid(rng) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const grid = Ticket.generateTicket(rng);
        if (this.isUnique(grid)) return grid;
      }
      throw new Error('Could not find a unique ticket after ' + MAX_ATTEMPTS + ' attempts');
    }

    // Generates and records one unique ticket for a person.
    issue(personId, source, rng) {
      const grid = this.generateUniqueGrid(rng);
      return this.addTicket(personId, grid, source);
    }

    addTicket(personId, grid, source) {
      const v = Ticket.validateTicket(grid);
      if (!v.ok) throw new Error('Invalid ticket: ' + v.errors.join('; '));
      if (!this.isUnique(grid)) throw new Error('Duplicate ticket or row');
      this._index(grid);
      const t = { serial: ++this.serialCounter, personId: personId, grid: grid, source: source || 'excel' };
      this.tickets.push(t);
      return t;
    }

    // Plan: output of Planner.planFromRows. Returns the issued tickets.
    // `onProgress(done, total)` is optional.
    issuePlan(plan, rng, onProgress) {
      const issued = [];
      let done = 0;
      plan.people.forEach(function (pp) {
        const person = this.ensurePerson(pp.key, pp.nameKey, pp.name);
        for (let i = 0; i < pp.total; i++) {
          issued.push(this.issue(person.id, 'excel', rng));
          done++;
          if (onProgress) onProgress(done, plan.totalTickets);
        }
      }, this);
      this.rememberUpload(plan.fingerprint);
      return issued;
    }

    rememberUpload(fp) { if (fp && this.uploads.indexOf(fp) < 0) this.uploads.push(fp); }
    hasUpload(fp) { return !!fp && this.uploads.indexOf(fp) >= 0; }

    // People in request order, each with their tickets sorted by serial, and file-name numbering.
    display() {
      return this.people.map(function (p) {
        const ts = this.ticketsOf(p.id).sort(function (a, b) { return a.serial - b.serial; });
        return { person: p, tickets: ts };
      }, this).filter(function (g) { return g.tickets.length > 0; });
    }

    // ---- persistence ----
    toJSON() {
      return {
        version: VERSION, rev: this.rev, serialCounter: this.serialCounter, nextPersonId: this.nextPersonId,
        people: this.people, uploads: this.uploads,
        tickets: this.tickets.map(function (t) { return { serial: t.serial, personId: t.personId, grid: t.grid, source: t.source }; })
      };
    }

    // Validates a serialised registry. Returns { ok, errors[] }.
    static validateData(data) {
      const errors = [];
      if (!data || typeof data !== 'object') return { ok: false, errors: ['Not a registry object'] };
      if (data.version !== VERSION) errors.push('Unsupported registry version: ' + data.version);
      if (!Array.isArray(data.people) || !Array.isArray(data.tickets)) errors.push('Missing people or tickets');
      if (errors.length) return { ok: false, errors: errors };
      const ids = new Set();
      data.people.forEach(function (p) {
        if (!p || typeof p.id !== 'number' || typeof p.name !== 'string' || typeof p.key !== 'string') errors.push('Malformed person entry');
        else ids.add(p.id);
      });
      const keys = new Set(), rows = new Set(), serials = new Set();
      data.tickets.forEach(function (t, i) {
        if (!t || !ids.has(t.personId)) { errors.push('Ticket #' + (i + 1) + ' refers to an unknown person'); return; }
        if (serials.has(t.serial)) errors.push('Duplicate serial ' + t.serial);
        serials.add(t.serial);
        const v = Ticket.validateTicket(t.grid);
        if (!v.ok) { errors.push('Ticket #' + (i + 1) + ' breaks the rules: ' + v.errors[0]); return; }
        const k = Ticket.ticketKey(t.grid);
        if (keys.has(k)) errors.push('Ticket #' + (i + 1) + ' duplicates an earlier ticket');
        keys.add(k);
        Ticket.rowKeys(t.grid).forEach(function (rk) {
          if (rows.has(rk)) errors.push('Ticket #' + (i + 1) + ' repeats a row of an earlier ticket');
          rows.add(rk);
        });
      });
      return { ok: errors.length === 0, errors: errors.slice(0, 20) };
    }

    static fromJSON(data) {
      const v = Registry.validateData(data);
      if (!v.ok) { const e = new Error(v.errors.join('; ')); e.errors = v.errors; throw e; }
      const r = new Registry();
      r.rev = data.rev || 0;
      r.people = data.people.map(function (p) { return { id: p.id, key: p.key, nameKey: p.nameKey || String(p.name).toLowerCase(), name: p.name }; });
      r.nextPersonId = Math.max(data.nextPersonId || 1, r.people.reduce(function (m, p) { return Math.max(m, p.id); }, 0) + 1);
      r.uploads = Array.isArray(data.uploads) ? data.uploads.slice() : [];
      data.tickets.forEach(function (t) {
        r._index(t.grid);
        r.tickets.push({ serial: t.serial, personId: t.personId, grid: t.grid, source: t.source || 'excel' });
      });
      r.serialCounter = Math.max(data.serialCounter || 0, r.tickets.reduce(function (m, t) { return Math.max(m, t.serial); }, 0));
      return r;
    }

    // Merge another registry's tickets into this one. Conflicting tickets are skipped and counted.
    merge(other) {
      let added = 0, skipped = 0;
      const idMap = new Map();
      other.people.forEach(function (p) { idMap.set(p.id, this.ensurePerson(p.key, p.nameKey, p.name).id); }, this);
      other.tickets.slice().sort(function (a, b) { return a.serial - b.serial; }).forEach(function (t) {
        if (!this.isUnique(t.grid)) { skipped++; return; }
        this.addTicket(idMap.get(t.personId), t.grid, t.source);
        added++;
      }, this);
      other.uploads.forEach(function (u) { this.rememberUpload(u); }, this);
      return { added: added, skipped: skipped };
    }
  }

  function formatSerial(n) { return '#' + String(n).padStart(4, '0'); }

  return { Registry, formatSerial, VERSION, MAX_ATTEMPTS };
});
