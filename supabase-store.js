// CollectIQ live database on Supabase (Postgres + Realtime), with the same
// calls the app already makes on Firebase Firestore: collection().doc().set /
// update / get / delete / onSnapshot, batch() and runTransaction(). So the app's
// save and merge logic stays as it is; only where the data lives changes.
// Tables and database functions: supabase/schema.sql.
(function (root) {
  const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const PAGE = 1000;
  const FLUSH_MS = 80;
  const OUTBOX_KEY = 'collectiq_supabase_outbox';

  const DELETE = { __cq: 'delete' };
  const FieldValue = {
    delete: () => DELETE,
    arrayUnion: (...items) => ({ __cq: 'union', items })
  };

  // Database errors in the shape the app already checks (err.code).
  function toError(e, fallback) {
    if (!e) return null;
    const msg = String(e.message || e.details || e || fallback || 'Live database error');
    const err = new Error(msg);
    const pg = String(e.code || '');
    if (pg === 'P0002' || /not-found/.test(msg)) err.code = 'not-found';
    else if (pg === '40001' || /conflict/.test(msg)) err.code = 'aborted';
    else if (pg === '42501' || /permission|row-level security|JWT/i.test(msg)) err.code = 'permission-denied';
    else if (isNetworkError(e)) err.code = 'unavailable';
    else err.code = pg || 'unknown';
    return err;
  }

  function isNetworkError(e) {
    const msg = String((e && (e.message || e.details)) || e || '');
    return /Failed to fetch|NetworkError|Network request failed|Load failed|fetch failed|ERR_INTERNET|ECONN/i.test(msg);
  }

  // A Firestore-style update ({field: value | FieldValue.delete() | arrayUnion(...)})
  // as the three parts the database function cq_patch takes.
  function splitUpdate(upd) {
    const set = {};
    const unset = [];
    const union = {};
    Object.keys(upd || {}).forEach(k => {
      const v = upd[k];
      if (v === DELETE || v === undefined) unset.push(k);
      else if (v && v.__cq === 'union') union[k] = clone(v.items);
      else set[k] = clone(v);
    });
    return { set, unset, union };
  }

  function docSnap(ref, row) {
    const data = row ? row.data : undefined;
    return {
      id: ref.id,
      ref,
      exists: !!row,
      data: () => (row ? clone(data) : undefined)
    };
  }

  function querySnap(coll, rows, changes) {
    const docs = rows.map(r => docSnap(coll.doc(r.id), r));
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      forEach: fn => docs.forEach(fn),
      docChanges: () => changes.map(c => ({ type: c.type, doc: docSnap(coll.doc(c.row.id), c.row) }))
    };
  }

  function create(client, options = {}) {
    const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const listeners = new Set();
    let channel = null;
    let channelUp = false;
    let wasDown = false;

    async function call(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw toError(error);
      return data;
    }

    async function fetchRows(collName, opts = {}) {
      const table = collName === 'collectiq_receipts' ? 'cq_files' : 'cq_docs';
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        let q = client.from(table).select('id,data,version').eq('collection', collName);
        if (opts.id != null) q = q.eq('id', String(opts.id));
        q = q.order('id', { ascending: true });
        const to = opts.limit ? Math.min(opts.limit, PAGE) - 1 : from + PAGE - 1;
        q = q.range(opts.limit ? 0 : from, to);
        const { data, error } = await q;
        if (error) throw toError(error);
        rows.push(...(data || []));
        if (opts.limit || opts.id != null || !data || data.length < PAGE) break;
      }
      return rows;
    }

    // Saves made while the internet is down wait on this PC and are sent when it
    // is back, in the order they were made (as Firestore did).
    function readOutbox() {
      try { return JSON.parse((storage && storage.getItem(OUTBOX_KEY)) || '[]'); } catch (e) { return []; }
    }
    function writeOutbox(list) {
      try { if (storage) storage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch (e) { /* full: kept in memory only */ }
    }
    let outbox = readOutbox();
    let flushing = null;

    function queue(op) {
      outbox.push(op);
      writeOutbox(outbox);
      flushOutbox();
    }

    function flushOutbox() {
      if (flushing || !outbox.length) return flushing || Promise.resolve();
      flushing = (async () => {
        while (outbox.length) {
          const op = outbox[0];
          try {
            await call('cq_batch', { p_ops: [op] });
          } catch (err) {
            if (err.code === 'unavailable') break;
            // The database refused it (for example the party was deleted): drop it.
            if (options.onDropped) options.onDropped(err, op);
          }
          outbox.shift();
          writeOutbox(outbox);
        }
      })().finally(() => { flushing = null; });
      return flushing;
    }

    // Sends one save now, or keeps it for later when the internet is down.
    async function send(op) {
      if (outbox.length) { queue(op); return; }
      try {
        await call('cq_batch', { p_ops: [op] });
      } catch (err) {
        if (err.code !== 'unavailable') throw err;
        queue(op);
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => flushOutbox());
    }
    const outboxTimer = setInterval(() => flushOutbox(), 20000);
    if (outboxTimer && outboxTimer.unref) outboxTimer.unref();

    // One live feed for the whole app; each listener picks its own records.
    function ensureChannel() {
      if (channel) return;
      channel = client.channel('cq_docs_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cq_docs' }, onLiveChange)
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            channelUp = true;
            // Back after a break: changes made meanwhile are fetched again.
            if (wasDown) listeners.forEach(l => l.resync());
            wasDown = false;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (channelUp) wasDown = true;
            channelUp = false;
            if (status !== 'CLOSED') listeners.forEach(l => l.onError && l.onError(toError({ message: 'Live updates interrupted (' + status + '); reconnecting…', code: 'unavailable' })));
          }
        });
    }

    function onLiveChange(payload) {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!row || !row.collection) return;
      listeners.forEach(l => { if (l.collection === row.collection) l.push(payload.eventType, row); });
    }

    // Keeps the latest copy of each record a listener has seen, and sends the
    // app only what changed, a few at a time.
    function listen(coll, docId, onNext, onError) {
      const known = new Map();
      const pending = [];
      let loaded = false;
      let buffered = [];
      let timer = null;
      let stopped = false;

      const emit = changes => {
        if (stopped) return;
        if (docId != null) {
          const row = known.get(String(docId));
          onNext(docSnap(coll.doc(docId), row || null));
        } else {
          const rows = [...known.values()];
          onNext(querySnap(coll, rows, changes));
        }
      };

      const flush = () => {
        timer = null;
        if (!pending.length) return;
        const changes = pending.splice(0);
        emit(changes);
      };

      const apply = (type, row) => {
        const id = String(row.id);
        if (docId != null && id !== String(docId)) return;
        const old = known.get(id);
        if (type === 'DELETE') {
          if (!old) return;
          known.delete(id);
          pending.push({ type: 'removed', row: old });
        } else {
          if (old && Number(old.version) >= Number(row.version)) return;
          known.set(id, { id, data: row.data, version: row.version });
          pending.push({ type: old ? 'modified' : 'added', row: known.get(id) });
        }
        if (!timer) timer = setTimeout(flush, FLUSH_MS);
      };

      const l = {
        collection: coll.name,
        onError,
        push(type, row) {
          if (!loaded) { buffered.push([type, row]); return; }
          // A record too big for the live feed arrives without its data: read it.
          if (type !== 'DELETE' && (row.data === undefined || row.data === null)) {
            fetchRows(coll.name, { id: row.id }).then(rows => {
              if (rows[0]) apply('UPDATE', rows[0]);
            }).catch(err => onError && onError(err));
            return;
          }
          apply(type, row);
        },
        async resync() {
          try {
            const rows = await fetchRows(coll.name, docId != null ? { id: docId } : {});
            const seen = new Set();
            rows.forEach(r => { seen.add(String(r.id)); apply('UPDATE', r); });
            [...known.keys()].forEach(id => { if (!seen.has(id)) apply('DELETE', known.get(id)); });
          } catch (err) {
            if (onError) onError(err);
          }
        }
      };

      listeners.add(l);
      ensureChannel();
      fetchRows(coll.name, docId != null ? { id: docId } : {}).then(rows => {
        if (stopped) return;
        rows.forEach(r => known.set(String(r.id), { id: String(r.id), data: r.data, version: r.version }));
        loaded = true;
        emit(rows.map(r => ({ type: 'added', row: known.get(String(r.id)) })));
        const early = buffered;
        buffered = [];
        early.forEach(([t, r]) => l.push(t, r));
      }).catch(err => { if (onError) onError(err); });

      return () => {
        stopped = true;
        listeners.delete(l);
        if (timer) clearTimeout(timer);
      };
    }

    function docRef(coll, id) {
      const ref = {
        id: String(id),
        path: `${coll.name}/${id}`,
        parent: coll,
        async set(data) {
          await send({ op: 'put', coll: coll.name, id: String(id), data: clone(data) });
        },
        async update(upd) {
          const { set, unset, union } = splitUpdate(upd);
          await send({ op: 'patch', coll: coll.name, id: String(id), set, unset, union });
        },
        async delete() {
          await send({ op: 'delete', coll: coll.name, id: String(id) });
        },
        async get() {
          const rows = await fetchRows(coll.name, { id });
          return docSnap(ref, rows[0] || null);
        },
        onSnapshot(onNext, onError) {
          return listen(coll, id, onNext, onError);
        }
      };
      return ref;
    }

    function collection(name, limitN) {
      const coll = {
        name,
        id: name,
        doc: id => docRef(coll, id),
        limit: n => collection(name, n),
        async get() {
          const rows = await fetchRows(name, limitN ? { limit: limitN } : {});
          return querySnap(coll, rows, rows.map(r => ({ type: 'added', row: r })));
        },
        onSnapshot(onNext, onError) {
          return listen(coll, null, onNext, onError);
        }
      };
      return coll;
    }

    function batch() {
      const ops = [];
      return {
        set(ref, data) { ops.push({ op: 'put', coll: ref.parent.name, id: ref.id, data: clone(data) }); return this; },
        update(ref, upd) { const p = splitUpdate(upd); ops.push({ op: 'patch', coll: ref.parent.name, id: ref.id, ...p }); return this; },
        delete(ref) { ops.push({ op: 'delete', coll: ref.parent.name, id: ref.id }); return this; },
        async commit() { if (ops.length) await call('cq_batch', { p_ops: ops }); }
      };
    }

    // Reads, then saves only if nobody else saved those records in between;
    // otherwise reads again and retries (as Firestore transactions do).
    async function runTransaction(fn, attempts = 5) {
      for (let i = 0; ; i++) {
        const versions = new Map();
        const ops = [];
        const key = ref => `${ref.parent.name}/${ref.id}`;
        const tx = {
          async get(ref) {
            const rows = await fetchRows(ref.parent.name, { id: ref.id });
            versions.set(key(ref), rows[0] ? Number(rows[0].version) : 0);
            return docSnap(ref, rows[0] || null);
          },
          set(ref, data) {
            ops.push({ op: 'put', coll: ref.parent.name, id: ref.id, data: clone(data), expected: versions.has(key(ref)) ? versions.get(key(ref)) : null });
            return tx;
          },
          update(ref, upd) {
            ops.push({ op: 'patch', coll: ref.parent.name, id: ref.id, ...splitUpdate(upd) });
            return tx;
          },
          delete(ref) {
            ops.push({ op: 'delete', coll: ref.parent.name, id: ref.id, expected: versions.has(key(ref)) ? versions.get(key(ref)) : null });
            return tx;
          }
        };
        const result = await fn(tx);
        try {
          if (ops.length) await call('cq_batch', { p_ops: ops });
          return result;
        } catch (err) {
          if (err.code !== 'aborted' || i + 1 >= attempts) throw err;
        }
      }
    }

    return {
      provider: 'supabase',
      FieldValue,
      collection: name => collection(name),
      batch,
      runTransaction,
      enablePersistence: () => Promise.resolve(),
      flushOutbox,
      pendingSaves: () => outbox.length,
      // Records of one collection saved on this device and still waiting to be sent.
      pendingIds: coll => new Set(outbox.filter(op => op.coll === coll && op.op !== 'delete').map(op => String(op.id))),
      fetchRows
    };
  }

  const api = { create, FieldValue, splitUpdate, toError, isNetworkError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SupabaseStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
