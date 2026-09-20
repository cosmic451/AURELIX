// ==UserScript==
// @name         AURELIX Auto Engine
// @author       Cosmic
// @version      0.5.62
// @description  AURELIX automation engine with smart combat, presets, resource recovery, auto loot, and adaptive targeting.
// @icon         https://raw.githubusercontent.com/cosmic451/afb-assets/main/aurelixauto.png
// @match        https://demonicscans.org/*
// @updateURL    https://raw.githubusercontent.com/cosmic451/AURELIX/refs/heads/main/AURELIX.meta.js
// @downloadURL  https://raw.githubusercontent.com/cosmic451/AURELIX/refs/heads/main/AURELIX.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

/* =========================================================
   AURELIX UPDATE SYSTEM
   ========================================================= */

const AURELIX_UPDATE = Object.freeze({
  currentVersion: '0.5.62',

  releaseURL:
    'https://raw.githubusercontent.com/cosmic451/AURELIX/refs/heads/main/release.json',

  downloadURL:
    'https://raw.githubusercontent.com/cosmic451/AURELIX/refs/heads/main/AURELIX.user.js',

  repositoryURL:
    'https://github.com/cosmic451/AURELIX'
});
/* =========================================================
   AURELIX UPDATE CHECKER
   ========================================================= */

function aurelixCompareVersions(a, b) {
  const parse = (version) =>
    String(version)
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map(part => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const x = left[i] || 0;
    const y = right[i] || 0;

    if (x > y) return 1;
    if (x < y) return -1;
  }

  return 0;
}


function aurelixCheckForUpdate() {
  return new Promise((resolve, reject) => {

    const requestURL =
  `${AURELIX_UPDATE.releaseURL}?_aurelix=${Date.now()}`;

GM_xmlhttpRequest({
  method: 'GET',
  url: requestURL,

  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache'
  },
      timeout: 10000,

      onload(response) {
        try {
          if (response.status < 200 || response.status >= 300) {
            throw new Error(
              `GitHub returned HTTP ${response.status}`
            );
          }

          const release = JSON.parse(response.responseText);

          if (
            !release ||
            typeof release.version !== 'string' ||
            !release.version.trim()
          ) {
            throw new Error(
              'Invalid AURELIX release information.'
            );
          }

          const latestVersion = release.version.trim();

          const comparison = aurelixCompareVersions(
            latestVersion,
            AURELIX_UPDATE.currentVersion
          );

          resolve({
            currentVersion: AURELIX_UPDATE.currentVersion,
            latestVersion,
            updateAvailable: comparison > 0,
            release,
            checkedAt: Date.now()
          });

        } catch (error) {
          reject(error);
        }
      },

      onerror() {
        reject(
          new Error('Unable to contact the AURELIX update server.')
        );
      },

      ontimeout() {
        reject(
          new Error('AURELIX update check timed out.')
        );
      }
    });

  });
}
/* =========================================================
   AURELIX UPDATE STATE
   ========================================================= */

const AURELIX_UPDATE_STATE = {
  status: 'idle',          // idle | checking | current | available | error
  currentVersion: AURELIX_UPDATE.currentVersion,
  latestVersion: null,
  release: null,
  checkedAt: null,
  error: null,
  request: null
};

async function aurelixGetUpdateStatus(force = false) {
  // Reuse an active request instead of creating duplicates.
  if (AURELIX_UPDATE_STATE.request) {
    return AURELIX_UPDATE_STATE.request;
  }

  // Reuse a successful result for 10 minutes unless manually forced.
  const cacheAge =
    Date.now() - (AURELIX_UPDATE_STATE.checkedAt || 0);

  if (
    !force &&
    AURELIX_UPDATE_STATE.latestVersion &&
    cacheAge < 10 * 60 * 1000
  ) {
    return AURELIX_UPDATE_STATE;
  }

  AURELIX_UPDATE_STATE.status = 'checking';
  AURELIX_UPDATE_STATE.error = null;

  AURELIX_UPDATE_STATE.request = (async () => {
    try {
      const result = await aurelixCheckForUpdate();

      AURELIX_UPDATE_STATE.currentVersion =
        result.currentVersion;

      AURELIX_UPDATE_STATE.latestVersion =
        result.latestVersion;

      AURELIX_UPDATE_STATE.release =
        result.release;

      AURELIX_UPDATE_STATE.checkedAt =
        result.checkedAt;

      AURELIX_UPDATE_STATE.status =
        result.updateAvailable
          ? 'available'
          : 'current';

      return AURELIX_UPDATE_STATE;

    } catch (error) {
      AURELIX_UPDATE_STATE.status = 'error';
      AURELIX_UPDATE_STATE.error =
        error instanceof Error
          ? error.message
          : String(error);

      throw error;

    } finally {
      AURELIX_UPDATE_STATE.request = null;
    }
  })();

  return AURELIX_UPDATE_STATE.request;
}
(() => {
  'use strict';
  const VERSION = '0.3.0';
  const ORIGIN = location.origin;
  const CONFIG = {
    autoStart: true,
    scanIntervalMs: 10 * 60_000,
    requestDelayMs: 25,
    requestTimeoutMs: 15_000,
    maxGatePages: 50,
    maxHubPages: 20,
    maxDungeonInstances: 10,
    maxDungeonLocationConcurrency: 4,
    dungeonRootPath: '/guild_dash.php',
    gatesRootPath: '/gates.php',
    gateAliveCookie: 'hide_dead_monsters',
    gateAliveCookieValue: '1',
    gateDeadBossCookie: 'show_dead_bosses_only',
    gateDeadBossCookieValue: '0',
    navigationFallbackPaths: ['/guild_dungeon.php', '/'],
    resourceInventoryPaths: ['/inventory.php'],
    gatePhaseFamilies: [],
    graktharGeneralFamilies: [],
    debug: false
  };
  const state = {
    running: false,
    timer: null,
    inFlight: null,
    scanController: null,
    listeners: new Set(),
    scanSeq: 0,
    lastScanStartedAt: null,
    lastScanFinishedAt: null,
    lastReport: null,
    requestLog: [],
    errors: []
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function log(...args) {
    if (CONFIG.debug) console.log('[AURELIX]', ...args);
  }
  function warn(...args) {
    console.warn('[AURELIX]', ...args);
  }
  function emitScannerEvent(type, detail = {}) {
    const event = Object.freeze({ type, at: nowIso(), ...detail });
    for (const listener of [...state.listeners]) {
      try { listener(event); } catch (error) { console.error('[AURELIX] scanner listener failed', error); }
    }
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }
  function normalizeSpace(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }
  function normalizeName(value) {
    return normalizeSpace(value)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"');
  }
  function numberFromText(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s || !/[0-9]/.test(s)) return null;
    const cleaned = s.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  function intParam(urlLike, key) {
    try {
      const u = new URL(urlLike, ORIGIN);
      const raw = u.searchParams.get(key);
      if (raw == null || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch (_) {
      return null;
    }
  }
  function safeUrl(urlLike) {
    try {
      return new URL(urlLike, ORIGIN).href;
    } catch (_) {
      return null;
    }
  }
  function sameOrigin(urlLike) {
    try {
      return new URL(urlLike, ORIGIN).origin === ORIGIN;
    } catch (_) {
      return false;
    }
  }
  function extractImageUrl(node) {
    if (!node) return null;
    const resolve = raw => {
      const value = normalizeSpace(raw || '');
      if (!value || /^(?:javascript:|about:blank)/i.test(value)) return null;
      try { return new URL(value, ORIGIN).href; } catch (_) { return null; }
    };
    const fromElement = el => {
      if (!el) return null;
      const attrs = [
        el.getAttribute?.('src'),
        el.getAttribute?.('data-src'),
        el.getAttribute?.('data-lazy-src'),
        el.getAttribute?.('data-original'),
        el.getAttribute?.('data-image'),
        el.getAttribute?.('data-img'),
        el.dataset?.src,
        el.dataset?.image,
        el.dataset?.img
      ];
      for (const raw of attrs) {
        const url = resolve(raw);
        if (url) return url;
      }
      const srcset = el.getAttribute?.('srcset') || el.getAttribute?.('data-srcset') || '';
      if (srcset) {
        const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
        const url = resolve(first);
        if (url) return url;
      }
      const style = el.getAttribute?.('style') || '';
      const bg = style.match(/background(?:-image)?\s*:\s*[^;]*url\((['"]?)(.*?)\1\)/i);
      if (bg?.[2]) {
        const url = resolve(bg[2]);
        if (url) return url;
      }
      return null;
    };
    const own = fromElement(node);
    if (own) return own;
    const selectors = [
      '.monster-image img', '.monster-img img', '.enemy-image img', '.mob-image img',
      'img.monster-image', 'img.monster-img', 'img.enemy-image', 'img.mob-image',
      '[data-monster-image]', '[data-image]', '[data-img]', 'picture img', 'img'
    ];
    for (const selector of selectors) {
      for (const el of node.querySelectorAll?.(selector) || []) {
        const url = fromElement(el);
        if (url) return url;
      }
    }
    for (const el of node.querySelectorAll?.('[style*="background"]') || []) {
      const url = fromElement(el);
      if (url) return url;
    }
    return null;
  }
  function textOf(el) {
    return normalizeSpace(el?.textContent || '');
  }
  function parseHtml(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }
  function uniqueBy(items, keyFn) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }
  async function mapWithConcurrency(items, limit, worker) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const results = new Array(list.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(Math.floor(Number(limit) || 1), list.length));
    const runners = Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= list.length) return;
        results[index] = await worker(list[index], index);
      }
    });
    await Promise.all(runners);
    return results;
  }
  function parseHpPair(text) {
    const patterns = [
      /([\d,]+)\s*\/\s*([\d,]+)\s*HP/i,
      /HP\s*([\d,]+)\s*\/\s*([\d,]+)/i,
      /([\d,]+)\s*\/\s*([\d,]+)/
    ];
    for (const re of patterns) {
      const m = String(text || '').match(re);
      if (!m) continue;
      const current = numberFromText(m[1]);
      const max = numberFromText(m[2]);
      if (current != null && max != null) return { current, max };
    }
    return { current: null, max: null };
  }
  function parseProgress(text) {
    const m = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return { cleared: null, total: null };
    return { cleared: Number(m[1]), total: Number(m[2]) };
  }
  function nowIso() {
    return new Date().toISOString();
  }
  function makeId(prefix, parts) {
    return `${prefix}:${parts.map(v => String(v ?? '?')).join(':')}`;
  }
  function firstMeaningfulLine(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(normalizeSpace)
      .filter(Boolean)
      .find(line =>
        !/^next spawn/i.test(line) &&
        !/^auto-die/i.test(line) &&
        !/^currently alive/i.test(line) &&
        !/^join$/i.test(line)
      ) || '';
  }
  function readCookieValue(name) {
    const encoded = encodeURIComponent(String(name));
    const parts = String(document.cookie || '').split(/;\s*/);
    for (const part of parts) {
      const eq = part.indexOf('=');
      const rawName = eq >= 0 ? part.slice(0, eq) : part;
      let decodedName = rawName;
      try { decodedName = decodeURIComponent(rawName); } catch (_) {}
      if (rawName === encoded || decodedName === String(name)) {
        const rawValue = eq >= 0 ? part.slice(eq + 1) : '';
        try { return decodeURIComponent(rawValue); } catch (_) { return rawValue; }
      }
    }
    return null;
  }
  function writeSessionCookie(name, value) {
    document.cookie = `${encodeURIComponent(String(name))}=${encodeURIComponent(String(value))}; Path=/; SameSite=Lax`;
  }
  function deleteCookie(name) {
    document.cookie = `${encodeURIComponent(String(name))}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
  function sharedGateCookieMutex() {
    const key = '__AURELIX_GATE_COOKIE_MUTEX__';
    if (!window[key] || typeof window[key] !== 'object') {
      window[key] = { tail: Promise.resolve() };
    }
    return window[key];
  }
  async function withSharedGateCookieLock(fn) {
    const mutex = sharedGateCookieMutex();
    const task = Promise.resolve(mutex.tail).then(fn, fn);
    mutex.tail = task.then(() => undefined, () => undefined);
    return await task;
  }
  async function withCookieOverrides(overrides, fn) {
    const entries = Object.entries(overrides || {});
    if (!entries.length) return await fn();
    return await withSharedGateCookieLock(async () => {
      const previous = new Map(entries.map(([name]) => [name, readCookieValue(name)]));
      try {
        for (const [name, value] of entries) writeSessionCookie(name, value);
        return await fn();
      } finally {
        for (const [name] of entries) {
          const oldValue = previous.get(name);
          if (oldValue == null) deleteCookie(name);
          else writeSessionCookie(name, oldValue);
        }
      }
    });
  }
  function gateAliveRequestUrl(urlLike) {
    try {
      const u = new URL(urlLike, ORIGIN);
      u.searchParams.delete('dead_page');
      return u.href;
    } catch (_) {
      return urlLike;
    }
  }
  async function getPage(urlLike, purpose = 'scan', options = {}) {
    const url = safeUrl(urlLike);
    if (!url || !sameOrigin(url)) throw new Error(`Refusing non-same-origin URL: ${urlLike}`);
    await sleep(CONFIG.requestDelayMs);
    const controller = new AbortController();
    const externalSignal = state.scanController?.signal || null;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
    const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    const started = Date.now();
    try {
      const request = async () => fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      const res = options.cookieOverrides
        ? await withCookieOverrides(options.cookieOverrides, request)
        : await request();
      const html = await res.text();
      const doc = parseHtml(html);
      const rec = {
        at: nowIso(),
        purpose,
        url,
        finalUrl: res.url,
        status: res.status,
        ok: res.ok,
        ms: Date.now() - started,
        title: normalizeSpace(doc.title || ''),
        linkCount: doc.querySelectorAll('a[href]').length,
        htmlBytes: html.length,
        populationView: options.populationView || null,
        cookieOverrideNames: options.cookieOverrides ? Object.keys(options.cookieOverrides) : []
      };
      state.requestLog.push(rec);
      if (state.requestLog.length > 60) state.requestLog.splice(0, state.requestLog.length - 60);
      if (!res.ok && !options.allowHttpErrors) throw new Error(`GET ${url} -> HTTP ${res.status}`);
      return { url, finalUrl: res.url, html, doc, status: res.status, ok: res.ok };
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
  }
  function discoverDungeonInstances(doc) {
    const found = [];
    const addInstance = (href, label = '', discoveredBy = 'navigation', fallbackId = null) => {
      const raw = String(href || '').replace(/&amp;/gi, '&').trim();
      let url = raw ? safeUrl(raw) : null;
      if (url && !sameOrigin(url)) url = null;
      let instanceId = intParam(raw, 'id') ?? intParam(raw, 'instance_id') ?? numberFromText(fallbackId);
      if (!instanceId && url) {
        instanceId = intParam(url, 'id') ?? intParam(url, 'instance_id');
      }
      if (!instanceId) return;
      if (!url) return;
      found.push({
        instanceId,
        nameHint: normalizeSpace(label || ''),
        discoveredBy,
        sourceHref: raw || null,
        entryUrl: url,
        url
      });
    };
    const openHeading = [...doc.querySelectorAll('h1,h2,h3,h4')].find(h =>
      /open\s+dungeons/i.test(textOf(h))
    );
    if (openHeading) {
      const container = openHeading.nextElementSibling;
      if (container) {
        for (const card of [...container.children]) {
          const enter = [...card.querySelectorAll('a[href],button,[data-href],[data-url],[formaction]')].find(el =>
            /\benter\b/i.test(textOf(el))
          );
          if (!enter) continue;
          const href = enter.getAttribute?.('href') || enter.getAttribute?.('data-href') ||
            enter.getAttribute?.('data-url') || enter.getAttribute?.('formaction') || '';
          const fallbackId = enter.dataset?.instanceId || enter.dataset?.id || null;
          addInstance(href, textOf(card) || textOf(enter), 'open-dungeons-enter', fallbackId);
        }
      }
    }
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!/guild_dungeon_[a-z0-9_]*\.php/i.test(href)) continue;
      if (!/[?&](?:id|instance_id)=\d+/i.test(href)) continue;
      addInstance(href, textOf(a.closest('div,section,article,li') || a), 'direct-dungeon-instance-link');
    }
    const html = doc.documentElement?.innerHTML || '';
    const re = /(?:https?:\/\/[^\s'\"<>]+)?\/?guild_dungeon_[a-z0-9_]*\.php\?[^\s'\"<>)]*(?:id|instance_id)=\d+[^\s'\"<>)]*/gi;
    let m;
    while ((m = re.exec(html))) {
      addInstance(m[0].replace(/&amp;/gi, '&'), '', 'embedded-dungeon-instance');
    }
    return uniqueBy(found, x => x.instanceId).slice(0, CONFIG.maxDungeonInstances);
  }
  function collectDungeonLocationRefs(doc, pageUrl, instanceId, dungeonName) {
    const out = [];
    const cleanLocationName = value => normalizeSpace(String(value || '')
      .replace(/\s*[—-]\s*\d+\s*\/\s*\d+.*$/i, '')
      .replace(/\s*•\s*locked.*$/i, '')
      .replace(/\s*\(Boss\)\s*[—-]?\s*locked.*$/i, '')
      .replace(/\s*•\s*Boss\s*$/i, '')
      .replace(/^enter\s+/i, ''));
    const add = ({ href = '', locationId = null, element = null, origin = 'navigation' }) => {
      const rawHref = String(href || '').replace(/&amp;/gi, '&');
      const hrefInstance = intParam(rawHref, 'instance_id');
      const explicitId = (locationId == null || String(locationId).trim() === '') ? null : numberFromText(locationId);
      const id = explicitId ?? intParam(rawHref, 'location_id');
      if (!id) return;
      if (hrefInstance != null && instanceId != null && Number(hrefInstance) !== Number(instanceId)) return;
      const context = element?.closest?.('.pin,.location-card,.room-card,.card,li,tr,section,article') || element;
      const contextText = textOf(context || element);
      const ownText = textOf(element);
      const classText = `${String(context?.className || '')} ${String(element?.className || '')}`;
      const titleText = element?.getAttribute?.('title') || context?.getAttribute?.('title') || '';
      const disabled = element?.hasAttribute?.('disabled') || element?.getAttribute?.('aria-disabled') === 'true';
      const locked = disabled || /\blocked\b|\bsealed\b|not\s+unlocked|access\s+blocked/i.test(`${classText} ${titleText} ${contextText}`) || /^javascript:/i.test(rawHref);
      const progress = parseProgress(contextText || ownText);
      let name = element?.dataset?.name || context?.dataset?.name || titleText || '';
      if (!name) {
        const heading = context?.querySelector?.('h1,h2,h3,h4,h5,strong,.name,.title,.location-name,.room-name');
        name = textOf(heading) || contextText || ownText;
      }
      name = cleanLocationName(name);
      let status = 'available';
      if (locked) status = 'locked';
      else if (progress.total != null && progress.total > 0 && progress.cleared >= progress.total) status = 'cleared';
      let url = null;
      if (!locked && rawHref && !/^javascript:/i.test(rawHref)) {
        const candidate = safeUrl(rawHref);
        if (candidate && sameOrigin(candidate)) url = candidate;
      }
      if (!locked && !url) {
        url = safeUrl(`/guild_dungeon_location.php?instance_id=${instanceId}&location_id=${id}`);
      }
      out.push({
        source: 'dungeon', instanceId, dungeonName, locationId: id,
        name: name || `Location ${id}`, status, locked, progress, url,
        bossLabel: /\bboss\b/i.test(`${contextText} ${titleText}`),
        discoveryMode: origin,
        discoveredFrom: pageUrl
      });
    };
    const selector = '[href],[data-href],[data-url],[data-link],[data-location-id],[data-location],[onclick],[formaction],[action]';
    for (const el of doc.querySelectorAll(selector)) {
      const explicitId = el.dataset?.locationId || el.getAttribute?.('data-location-id') || el.dataset?.location || null;
      for (const attr of ['href','data-href','data-url','data-link','onclick','formaction','action']) {
        const value = el.getAttribute?.(attr) || '';
        if (!value) continue;
        const refs = String(value).match(/(?:https?:\/\/[^\s'\"<>]+)?\/?guild_dungeon_location\.php\?[^\s'\"<>)]*/ig) || [];
        if (refs.length) {
          for (const ref of refs) add({ href: ref, locationId: explicitId, element: el, origin: attr });
        } else if (explicitId) {
          add({ href: value, locationId: explicitId, element: el, origin: attr });
        }
      }
      if (explicitId) add({ locationId: explicitId, element: el, origin: 'data-location-id' });
    }
    for (const input of doc.querySelectorAll('input[name="location_id"][value],button[name="location_id"][value],option[value]')) {
      const id = numberFromText(input.value || input.getAttribute('value'));
      if (id) add({ locationId: id, element: input, origin: 'form-location-id' });
    }
    const html = doc.documentElement?.innerHTML || '';
    const re = /(?:https?:\/\/[^\s'\"<>]+)?\/?guild_dungeon_location\.php\?[^\s'\"<>)]*location_id=\d+[^\s'\"<>)]*/gi;
    let m;
    while ((m = re.exec(html))) add({ href: m[0].replace(/&amp;/gi, '&'), origin: 'embedded-html' });
    const merged = new Map();
    for (const loc of out) {
      const key = String(loc.locationId);
      const prev = merged.get(key);
      if (!prev) { merged.set(key, loc); continue; }
      merged.set(key, {
        ...prev,
        ...loc,
        name: (loc.name && !/^Location \d+$/i.test(loc.name)) ? loc.name : prev.name,
        locked: prev.locked || loc.locked,
        status: (prev.status === 'locked' || loc.status === 'locked') ? 'locked' :
          (prev.status === 'cleared' || loc.status === 'cleared') ? 'cleared' : 'available',
        url: (prev.locked || loc.locked) ? null : (loc.url || prev.url),
        bossLabel: prev.bossLabel || loc.bossLabel,
        progress: (loc.progress?.total != null) ? loc.progress : prev.progress
      });
    }
    return [...merged.values()].sort((a,b) => Number(a.locationId) - Number(b.locationId));
  }
  function parseDungeonInstance(doc, url, instanceId) {
    const title = normalizeSpace(doc.title || '');
    const dungeonName = normalizeSpace(title.replace(/\s*[—-]\s*Instance\s*#?\d+.*$/i, '')) || null;
    const body = textOf(doc.body);
    const locations = collectDungeonLocationRefs(doc, url, instanceId, dungeonName);
    return {
      source: 'dungeon',
      instanceId,
      name: dungeonName,
      url,
      status: /Status:\s*Active/i.test(body) ? 'active' : 'unknown',
      locations
    };
  }
  function parseDungeonMonsterCard(card, context) {
    const text = textOf(card);
    const fightLink = card.querySelector('a[href*="battle.php"]');
    const href = fightLink?.getAttribute('href') || '';
    const dgmid = intParam(href, 'dgmid');
    const instanceIdFromLink = intParam(href, 'instance_id');
    const hp = parseHpPair(text);
    const isStatusLine = value => {
      const v = normalizeSpace(value);
      if (!v) return true;
      return /^(?:not\s+joined|joined|not\s+looted|looted|no\s+loot(?:\s*\([^)]*\))?|unclaimed|claimed|dead|alive|locked)$/i.test(v) ||
        /^(?:hp|atk|def|exp|fight|attack|loot|join)$/i.test(v) ||
        /^\d[\d,]*\s*\/\s*\d/i.test(v);
    };
    const cleanMonsterName = value => normalizeSpace(String(value || '')
      .replace(/\s+(?:not\s+joined|joined|not\s+looted|looted|unclaimed|claimed|dead|alive|locked)\s*$/i, '')
      .replace(/\s+no\s+loot(?:\s*\([^)]*\))?\s*$/i, ''));
    let name = normalizeSpace(card.dataset?.name || '');
    if (isStatusLine(name)) name = '';
    if (!name) {
      const selectors = [
        '.monster-name',
        '.mon-name',
        '.name',
        '[data-monster-name]',
        'h1','h2','h3','h4','h5'
      ];
      for (const selector of selectors) {
        const el = card.querySelector(selector);
        const candidate = normalizeSpace(
          el?.dataset?.monsterName ||
          el?.getAttribute?.('data-monster-name') ||
          textOf(el)
        );
        if (candidate && !isStatusLine(candidate)) {
          name = candidate;
          break;
        }
      }
    }
    if (!name) {
      const lines = String(card.textContent || '')
        .split(/\r?\n/)
        .map(normalizeSpace)
        .filter(Boolean);
      name = lines.find(line => !isStatusLine(line)) || '';
    }
    name = cleanMonsterName(name);
    const readUserDamage = () => {
      const parse = value => {
        const m = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        if (!m) return null;
        const n = Number(m[0]);
        return Number.isFinite(n) ? Math.max(0, n) : null;
      };
      const candidates = [
        card.dataset?.userdmg, card.dataset?.userDamage, card.dataset?.yourdmg, card.dataset?.yourDamage,
        card.getAttribute?.('data-userdmg'), card.getAttribute?.('data-user-damage'), card.getAttribute?.('data-your-damage')
      ];
      for (const value of candidates) {
        const n = parse(value);
        if (Number.isFinite(n)) return n;
      }
      for (const el of card.querySelectorAll('[data-userdmg],[data-user-damage],[data-your-damage],.your-damage,.user-damage')) {
        const raw = el.getAttribute('data-userdmg') ?? el.getAttribute('data-user-damage') ?? el.getAttribute('data-your-damage') ?? el.textContent;
        const n = parse(raw);
        if (Number.isFinite(n)) return n;
      }
      const flat = String(card.textContent || '').replace(/\s+/g, ' ').trim();
      for (const re of [/\byou\s*:\s*([\d,]+(?:\.\d+)?)/i, /your\s*damage\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i]) {
        const m = flat.match(re);
        if (m) {
          const n = parse(m[1]);
          if (Number.isFinite(n)) return n;
        }
      }
      return null;
    };
    const runtimeId = dgmid;
    const userDamage = readUserDamage();
    const imageUrl = extractImageUrl(card);
    const explicitDead =
      String(card.dataset?.dead || '') === '1' ||
      (hp.current != null && hp.current <= 0) ||
      /\bdead\b|\bnot\s+looted\b|\blooted\b/i.test(text);
    const alive = !explicitDead && runtimeId != null && hp.current != null && hp.current > 0;
    return {
      entityId: makeId('dungeon-entity', [context.instanceId, context.locationId, runtimeId]),
      source: 'dungeon',
      targetEligible: alive,
      specialType: 'dungeon-mob',
      dungeonName: context.dungeonName,
      instanceId: context.instanceId,
      locationId: context.locationId,
      locationName: context.locationName,
      encounterKey: makeId('dungeon-encounter', [context.instanceId, context.locationId]),
      name: name || null,
      normalizedName: normalizeName(name),
      dgmid: runtimeId,
      runtimeId,
      currentHp: hp.current,
      maxHp: hp.max,
      status: alive ? 'alive' : (explicitDead ? 'dead' : 'unknown'),
      userDamage,
      image: imageUrl,
      imageUrl,
      battleUrl: href ? safeUrl(href) : null,
      discoveredAt: nowIso(),
      _linkInstanceId: instanceIdFromLink
    };
  }
  function parseDungeonLocation(doc, context) {
    const body = textOf(doc.body);
    const cards = [...doc.querySelectorAll('.mon,.monster-card,[data-dgmid],[data-monster-id]')]
      .filter((card, index, all) => !all.some((other, otherIndex) => otherIndex < index && other.contains(card)));
    const monsters = cards.map(card => parseDungeonMonsterCard(card, context));
    const totalMatch = body.match(/Total:\s*(\d+)/i);
    const leftMatch = body.match(/Left:\s*(\d+)/i);
    return {
      source: 'dungeon',
      instanceId: context.instanceId,
      dungeonName: context.dungeonName,
      locationId: context.locationId,
      locationName: context.locationName,
      total: totalMatch ? Number(totalMatch[1]) : null,
      left: leftMatch ? Number(leftMatch[1]) : null,
      monsters
    };
  }
  function extractJsonConstFromScripts(doc, constName) {
    for (const script of [...doc.scripts]) {
      if (script.src) continue;
      const text = script.textContent || '';
      const marker = `const ${constName} = `;
      const start = text.indexOf(marker);
      if (start < 0) continue;
      let i = start + marker.length;
      while (/\s/.test(text[i] || '')) i++;
      const opener = text[i];
      if (opener !== '{' && opener !== '[') continue;
      const closer = opener === '{' ? '}' : ']';
      let depth = 0, inString = false, escaped = false;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === opener) depth++;
        else if (ch === closer) {
          depth--;
          if (depth === 0) {
            const raw = text.slice(i, j + 1);
            try { return JSON.parse(raw); } catch (_) { break; }
          }
        }
      }
    }
    return null;
  }
  function parseCubeOverview(doc, pageUrl, instanceId) {
    const cubeState = extractJsonConstFromScripts(doc, 'STATE');
    const faceData = extractJsonConstFromScripts(doc, 'FACE_DATA');
    if (!cubeState || !Array.isArray(cubeState.nodes)) return null;
    const nodes = cubeState.nodes.map(node => ({
      nodeId: numberFromText(node.id),
      faceKey: normalizeSpace(node.face_key || ''),
      key: normalizeSpace(node.key || ''),
      name: normalizeSpace(node.name || ''),
      type: normalizeSpace(node.type || '').toLowerCase(),
      status: normalizeSpace(node.status || '').toLowerCase() || 'unknown',
      isRevealed: Number(node.is_revealed || 0) === 1,
      isCleared: Number(node.is_cleared || 0) === 1,
      isBossGate: Number(node.is_boss_gate || 0) === 1,
      unlockRule: normalizeSpace(node.unlock_rule || ''),
      linkedLocationId: numberFromText(node.linked_location_id),
      pvpEncounterId: numberFromText(node.pvp_encounter_id),
      armyEncounterId: numberFromText(node.army_encounter_id),
      shopId: numberFromText(node.shop_id),
      monstersTotal: numberFromText(node.monsters_total),
      monstersLeft: numberFromText(node.monsters_left),
      stateMeta: node.state_meta ?? null,
      enterLabel: normalizeSpace(node.enter_label || ''),
      hint: normalizeSpace(node.hint || '')
    }));
    return {
      implementation: 'cube',
      instanceId,
      name: normalizeSpace(doc.title || '').replace(/\s*[-—]\s*Cube Instance.*$/i, '') || 'Special Dungeon',
      url: pageUrl,
      currentFaceKey: normalizeSpace(cubeState.current_face_key || ''),
      selectedNodeId: numberFromText(cubeState.selected_node_id),
      entryNodeId: numberFromText(cubeState.entry_node_id),
      totalClears: numberFromText(cubeState.total_clears),
      nodes,
      edges: Array.isArray(cubeState.edges) ? cubeState.edges : [],
      faces: Array.isArray(cubeState.faces) ? cubeState.faces : [],
      faceDataAvailable: !!faceData
    };
  }
  async function scanCubeDungeon(page, seed, dungeon) {
    const locations = [];
    const entities = [];
    const actionable = dungeon.nodes.filter(node =>
      node.isRevealed && !node.isCleared &&
      (node.status === 'available' || node.status === 'in_progress')
    );
    for (const node of dungeon.nodes) {
      const locationId = node.linkedLocationId;
      const hasCombatLocation = locationId != null && locationId > 0;
      const status = node.isCleared ? 'cleared' : (!node.isRevealed || node.status === 'hidden' ? 'locked' : node.status || 'unknown');
      const location = {
        source: 'dungeon',
        implementation: 'cube',
        instanceId: seed.instanceId,
        dungeonName: dungeon.name,
        nodeId: node.nodeId,
        faceKey: node.faceKey,
        locationId: hasCombatLocation ? locationId : null,
        name: node.name,
        type: node.type,
        status,
        isRevealed: node.isRevealed,
        isCleared: node.isCleared,
        unlockRule: node.unlockRule || null,
        monstersLeft: node.monstersLeft,
        monstersTotal: node.monstersTotal,
        pvpEncounterId: node.pvpEncounterId || null,
        armyEncounterId: node.armyEncounterId || null,
        url: hasCombatLocation && node.isRevealed
          ? safeUrl(`/guild_dungeon_location.php?instance_id=${seed.instanceId}&location_id=${locationId}`)
          : null
      };
      locations.push(location);
      if (!hasCombatLocation || status !== 'available' && status !== 'in_progress' || !location.url) continue;
      try {
        const locPage = await getPage(location.url, `cube-location:${seed.instanceId}:${locationId}`);
        const detail = parseDungeonLocation(locPage.doc, {
          instanceId: seed.instanceId,
          dungeonName: dungeon.name,
          locationId,
          locationName: node.name
        });
        entities.push(...detail.monsters.map(e => ({ ...e, implementation: 'cube', cubeNodeId: node.nodeId, cubeFaceKey: node.faceKey })));
        location.serverLeft = detail.left;
        location.serverTotal = detail.total;
      } catch (e) {
        state.errors.push({ at: nowIso(), stage: 'cube-location', instanceId: seed.instanceId, nodeId: node.nodeId, locationId, message: String(e?.message || e) });
      }
    }
    dungeon.actionableNodeIds = actionable.map(n => n.nodeId);
    return { locations, entities };
  }
  function collectGateWaveLinks(doc, sourceUrl = location.href, expectedGateId = null) {
    const out = [];
    const candidates = [];
    const pushCandidate = (href, label = '', className = '', origin = 'attribute') => {
      if (!href || !/active_wave\.php/i.test(href)) return;
      candidates.push({ href: String(href), label, className, origin });
    };
    for (const a of doc.querySelectorAll('a[href]')) {
      pushCandidate(a.getAttribute('href') || '', textOf(a), String(a.className || ''), 'href');
    }
    for (const el of doc.querySelectorAll('[data-href],[data-url],[data-link],[formaction],[action],[onclick]')) {
      for (const attr of ['data-href', 'data-url', 'data-link', 'formaction', 'action', 'onclick']) {
        const value = el.getAttribute?.(attr) || '';
        if (!value) continue;
        const matches = String(value).match(/(?:https?:\/\/[^\s'"<>]+)?\/?active_wave\.php\?[^\s'"<>)]*/ig) || [];
        for (const href of matches) pushCandidate(href, textOf(el), String(el.className || ''), attr);
      }
    }
    const html = doc.documentElement?.innerHTML || '';
    const embedded = html.match(/(?:https?:\/\/[^\s'"<>]+)?\/?active_wave\.php\?(?:amp;)?gate=\d+(?:&|&amp;)wave=\d+[^\s'"<>)]*/ig) || [];
    for (const href of embedded) pushCandidate(href.replace(/&amp;/gi, '&'), '', '', 'embedded-html');
    for (const candidate of candidates) {
      const href = candidate.href.replace(/&amp;/gi, '&');
      const gateId = intParam(href, 'gate');
      const waveId = intParam(href, 'wave');
      if (!gateId || !waveId) continue; // event waves are intentionally excluded.
      if (expectedGateId != null && Number(gateId) !== Number(expectedGateId)) continue;
      const url = safeUrl(href);
      if (!url || !sameOrigin(url)) continue;
      out.push({
        gateId,
        waveId,
        label: candidate.label,
        className: candidate.className,
        discoveryOrigin: candidate.origin,
        url,
        discoveredFrom: sourceUrl
      });
    }
    return uniqueBy(out, x => `${x.gateId}:${x.waveId}`);
  }
  function collectSafeHubLinks(doc, pageUrl) {
    const out = [];
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      const cls = String(a.className || '');
      const label = textOf(a);
      const navigationClass = /wave-chip|domain-marker|map-back-btn|gate-card/i.test(cls);
      const navigationText = /invade|domain|gate\s*(?:map|hub)|back\s+to/i.test(label);
      if (!navigationClass && !navigationText) continue;
      const url = safeUrl(href);
      if (!url || !sameOrigin(url)) continue;
      const u = new URL(url);
      if (!/\.php$/i.test(u.pathname)) continue;
      if (/active_wave\.php$/i.test(u.pathname)) continue;
      if (/battle\.php$/i.test(u.pathname)) continue;
      if (/damage|join|loot|heal|use_item|apply/i.test(u.pathname)) continue;
      out.push({ url, label, discoveredFrom: pageUrl });
    }
    return uniqueBy(out, x => x.url).slice(0, CONFIG.maxHubPages);
  }
  function gateNameFromPage(doc) {
    const title = normalizeSpace(doc.title || '');
    if (!title) return null;
    return normalizeSpace(title.split(/\s+[—-]\s+/)[0]) || null;
  }
  function gateWaveDisplayFromPage(doc) {
    const title = normalizeSpace(doc.title || '');
    const waveTitle = textOf(doc.querySelector('.wave-title'));
    if (waveTitle) return waveTitle.split(/Recommended Level|EXP soft cap/i)[0].replace(/^🌊\s*/, '').trim();
    const m = title.match(/\bWave\s*\d+\b/i);
    if (m) return m[0];
    const parts = title.split(/\s+[—-]\s+/);
    return parts.length > 1 ? parts.slice(1).join(' - ') : null;
  }
  async function discoverGateTopology(bootstrapDocs) {
    const waveMap = new Map();
    const hubMap = new Map();
    const fetchedWaveDocs = new Map();
    const fetchedHubDocs = new Map();
    const processedWaves = new Set();
    const processedHubs = new Set();
    const addWave = link => {
      if (!link?.gateId || !link?.waveId || !link?.url) return false;
      const key = `${link.gateId}:${link.waveId}`;
      if (waveMap.has(key)) return false;
      waveMap.set(key, link);
      return true;
    };
    const addHub = hub => {
      if (!hub?.url || hubMap.has(hub.url)) return false;
      hubMap.set(hub.url, hub);
      return true;
    };
    for (const { doc, url } of bootstrapDocs) {
      for (const link of collectGateWaveLinks(doc, url)) addWave(link);
      for (const hub of collectSafeHubLinks(doc, url)) addHub(hub);
    }

    const scanWave = async nextWave => {
      const key = `${nextWave.gateId}:${nextWave.waveId}`;
      processedWaves.add(key);
      try {
        const page = await getPage(gateAliveRequestUrl(nextWave.url), `gate-wave:${key}`, {
          populationView: 'alive-monsters'
        });
        fetchedWaveDocs.set(key, page);
        nextWave.gateName = gateNameFromPage(page.doc);
        nextWave.waveDisplay = gateWaveDisplayFromPage(page.doc) || nextWave.label || `Wave ${nextWave.waveId}`;
        for (const link of collectGateWaveLinks(page.doc, nextWave.url, nextWave.gateId)) addWave(link);
        for (const hub of collectSafeHubLinks(page.doc, nextWave.url)) addHub(hub);
      } catch (e) {
        state.errors.push({ at: nowIso(), stage: 'gate-wave', key, message: String(e?.message || e) });
      }
    };

    while (true) {
      const remainingWaveSlots = Math.max(0, CONFIG.maxGatePages - processedWaves.size);
      const waveBatch = [...waveMap.values()]
        .filter(w => !processedWaves.has(`${w.gateId}:${w.waveId}`))
        .slice(0, Math.min(3, remainingWaveSlots));
      if (waveBatch.length) {
        // Bounded parallelism: live timing diagnostics showed sequential Gate-wave GETs
        // dominate scan duration. Three concurrent reads materially reduce wall-clock time
        // without turning the scanner into an unbounded request burst.
        await withCookieOverrides({
          [CONFIG.gateAliveCookie]: CONFIG.gateAliveCookieValue,
          [CONFIG.gateDeadBossCookie]: CONFIG.gateDeadBossCookieValue
        }, () => Promise.all(waveBatch.map(scanWave)));
        continue;
      }

      const nextHub = [...hubMap.values()].find(h => !processedHubs.has(h.url));
      if (nextHub && processedHubs.size < CONFIG.maxHubPages) {
        processedHubs.add(nextHub.url);
        try {
          const page = await getPage(nextHub.url, 'gate-hub');
          fetchedHubDocs.set(nextHub.url, page);
          for (const link of collectGateWaveLinks(page.doc, nextHub.url)) addWave(link);
          for (const hub of collectSafeHubLinks(page.doc, nextHub.url)) addHub(hub);
        } catch (e) {
          state.errors.push({ at: nowIso(), stage: 'gate-hub', url: nextHub.url, message: String(e?.message || e) });
        }
        continue;
      }
      break;
    }
    return {
      waves: [...waveMap.values()],
      hubs: [...hubMap.values()],
      fetchedWaveDocs,
      fetchedHubDocs,
      coverage: {
        discovered: waveMap.size,
        fetched: fetchedWaveDocs.size,
        missing: [...waveMap.values()]
          .filter(w => !fetchedWaveDocs.has(`${w.gateId}:${w.waveId}`))
          .map(w => ({ gateId: w.gateId, waveId: w.waveId, url: w.url }))
      }
    };
  }
  function parseGateMonsterCard(card, context) {
    const text = textOf(card);
    const runtimeId = numberFromText(card.dataset.monsterId || card.dataset.mid);
    const hp = parseHpPair(text);
    const isStatusLine = value => {
      const v = normalizeSpace(value);
      return !v ||
        /^(?:not\s+joined|joined|not\s+looted|looted|no\s+loot(?:\s*\([^)]*\))?|unclaimed|claimed|dead|alive|locked)$/i.test(v) ||
        /^(?:hp|atk|def|exp|fight|attack|loot|join)$/i.test(v) ||
        /^\d[\d,]*\s*\/\s*\d/i.test(v);
    };
    const cleanMonsterName = value => normalizeSpace(String(value || '')
      .replace(/\s+(?:not\s+joined|joined|not\s+looted|looted|unclaimed|claimed|dead|alive|locked)\s*$/i, '')
      .replace(/\s+no\s+loot(?:\s*\([^)]*\))?\s*$/i, ''));
    let name = normalizeSpace(card.dataset.name || '');
    if (isStatusLine(name)) name = '';
    if (!name) {
      for (const selector of ['.monster-name','.mon-name','.name','[data-monster-name]','h1','h2','h3','h4','h5']) {
        const el = card.querySelector(selector);
        const candidate = normalizeSpace(el?.dataset?.monsterName || el?.getAttribute?.('data-monster-name') || textOf(el));
        if (candidate && !isStatusLine(candidate)) {
          name = candidate;
          break;
        }
      }
    }
    if (!name) {
      name = String(card.textContent || '')
        .split(/\r?\n/)
        .map(normalizeSpace)
        .find(line => line && !isStatusLine(line)) || '';
    }
    name = cleanMonsterName(name);
    const battle = card.querySelector('a[href*="battle.php?id="]');
    const battleUrl = battle ? safeUrl(battle.getAttribute('href')) : (runtimeId ? safeUrl(`/battle.php?id=${runtimeId}`) : null);
    const imageUrl = extractImageUrl(card);
    const deadFlag = String(card.dataset.dead || '') === '1';
    const alive = !deadFlag && (hp.current == null || hp.current > 0) && runtimeId != null;
    return {
      entityId: makeId('gate-entity', [context.gateId, context.waveId, runtimeId]),
      source: 'gate',
      targetEligible: false,
      specialType: null,
      gateId: context.gateId,
      gateName: context.gateName,
      waveId: context.waveId,
      waveDisplay: context.waveDisplay,
      encounterKey: makeId('gate-wave', [context.gateId, context.waveId]),
      name: name || null,
      normalizedName: normalizeName(name),
      monsterId: runtimeId,
      runtimeId,
      currentHp: hp.current,
      maxHp: hp.max,
      status: alive ? 'alive' : (deadFlag ? 'dead' : 'unknown'),
      joined: String(card.dataset.joined || '') === '1',
      unjoined: String(card.dataset.unjoined || '') === '1',
      userDamage: numberFromText(card.dataset.userdmg),
      expireAtUnix: numberFromText(card.dataset.expire),
      cardBossFlag: String(card.dataset.boss || '') === '1',
      image: imageUrl,
      imageUrl,
      battleUrl,
      discoveredAt: nowIso()
    };
  }
  function configuredGateFamilyFor(name, gateName) {
    const n = normalizeName(name);
    const g = normalizeName(gateName);
    return CONFIG.gatePhaseFamilies.find(f => {
      if (f.gateName && normalizeName(f.gateName) !== g) return false;
      return Array.isArray(f.aliases) && f.aliases.some(a => normalizeName(a) === n);
    }) || null;
  }
  function configuredGeneralFamilyFor(name) {
    const n = normalizeName(name);
    return CONFIG.graktharGeneralFamilies.find(f =>
      Array.isArray(f.aliases) && f.aliases.some(a => normalizeName(a) === n)
    ) || null;
  }
  function timerBossRecords(doc, context, entities) {
    const timerCards = [...doc.querySelectorAll('.auto-summon-card')];
    const out = [];
    timerCards.forEach((timerCard, index) => {
      const text = String(timerCard.textContent || '');
      const name = firstMeaningfulLine(text);
      if (!name) return;
      const battleLink = timerCard.querySelector('a[href*="battle.php?id="]');
      const hintedRuntimeId = battleLink ? intParam(battleLink.getAttribute('href') || '', 'id') : null;
      const nextSpawn = normalizeSpace((text.match(/Next spawn[^·\n]*/i) || [])[0] || '');
      const autoDie = normalizeSpace((text.match(/Auto-die[^\n]*/i) || [])[0] || '');
      const timerName = normalizeName(name);
      const configured = configuredGateFamilyFor(name, context.gateName);
      const familyKey = configured?.key || makeId('gate-timer-family', [context.gateId, context.waveId, index]);
      const aliasNames = new Set([timerName]);
      if (configured?.aliases) {
        for (const alias of configured.aliases) aliasNames.add(normalizeName(alias));
      }
      let matches = entities.filter(e => aliasNames.has(e.normalizedName));
      if (hintedRuntimeId != null) {
        const byId = entities.find(e => e.runtimeId === hintedRuntimeId);
        if (byId && !matches.includes(byId)) matches.push(byId);
      }
      const isGeneral = /\bgeneral\b/i.test(name);
      const specialType = isGeneral ? 'grakthar-general' : 'timed-boss';
      for (const entity of matches) {
        entity.specialType = specialType;
        entity.phaseFamilyKey = familyKey;
        entity.timerSlot = index;
        entity.timerName = name;
        entity.classifiedByTimer = true;
        entity.targetEligible = entity.status === 'alive';
      }
      const aliveMatches = matches.filter(e => e.status === 'alive');
      out.push({
        familyKey,
        source: 'gate',
        specialType,
        gateId: context.gateId,
        gateName: context.gateName,
        waveId: context.waveId,
        waveDisplay: context.waveDisplay,
        timerSlot: index,
        name,
        normalizedName: timerName,
        timerSaysAlive: /currently alive/i.test(text) && !/not currently alive|dead/i.test(text),
        hintedRuntimeId,
        nextSpawnText: nextSpawn || null,
        autoDieText: autoDie || null,
        matchedEntityIds: matches.map(e => e.entityId),
        matchedRuntimeIds: matches.map(e => e.runtimeId),
        aliveMatchedEntityIds: aliveMatches.map(e => e.entityId),
        aliveMatchedRuntimeIds: aliveMatches.map(e => e.runtimeId),
        matchedCount: matches.length,
        aliveMatchedCount: aliveMatches.length
      });
    });
    return out;
  }
  function markGraktharWave3Generals(entities, context) {
    const ids = [];
    for (const entity of entities) {
      if (entity.specialType === 'grakthar-general') {
        ids.push(entity.entityId);
        continue;
      }
      const configured = configuredGeneralFamilyFor(entity.name);
      if (!configured) continue;
      entity.specialType = 'grakthar-general';
      entity.phaseFamilyKey = configured.key;
      entity.targetEligible = entity.status === 'alive';
      ids.push(entity.entityId);
    }
    return ids;
  }
  function parseGateWave(doc, link) {
    const context = {
      gateId: link.gateId,
      gateName: link.gateName || gateNameFromPage(doc),
      waveId: link.waveId,
      waveDisplay: link.waveDisplay || gateWaveDisplayFromPage(doc),
      pageTitle: normalizeSpace(doc.title || '')
    };
    const entities = [...doc.querySelectorAll('.monster-card[data-monster-id], .monster-card')]
      .map(card => parseGateMonsterCard(card, context))
      .filter(e => e.runtimeId != null);
    const timerBosses = timerBossRecords(doc, context, entities);
    const generalEntityIds = markGraktharWave3Generals(entities, context);
    const population = {
      requestedView: 'alive-monsters',
      monsterCardCount: entities.length,
      aliveCardCount: entities.filter(e => e.status === 'alive').length,
      deadCardCount: entities.filter(e => e.status === 'dead').length,
      unknownCardCount: entities.filter(e => e.status === 'unknown').length,
      timerCount: timerBosses.length,
      matchedTimerFamilies: timerBosses.filter(t => t.matchedCount > 0).length,
      aliveMatchedTimerFamilies: timerBosses.filter(t => t.aliveMatchedCount > 0).length
    };
    return {
      source: 'gate',
      gateId: context.gateId,
      gateName: context.gateName,
      waveId: context.waveId,
      waveDisplay: context.waveDisplay,
      url: link.url,
      entities,
      timerBosses,
      generalEntityIds,
      population
    };
  }
  function previousEntitiesByEncounter(previousReport) {
    const map = new Map();
    if (!previousReport) return map;
    for (const entity of previousReport.entities || []) {
      if (!entity.encounterKey) continue;
      if (!map.has(entity.encounterKey)) map.set(entity.encounterKey, []);
      map.get(entity.encounterKey).push(entity);
    }
    return map;
  }
  function previousBossFamilies(previousReport) {
    const map = new Map();
    if (!previousReport) return map;
    for (const boss of previousReport.gateBossFamilies || []) {
      if (boss.familyKey) map.set(boss.familyKey, boss);
    }
    return map;
  }
  function gatePhaseRoot(name) {
    const raw = normalizeSpace(name);
    if (!raw) return '';
    const commaHead = raw.split(',')[0];
    const normalized = normalizeName(commaHead);
    return normalized.split(/\s+/)[0] || '';
  }
  function reconcileGatePhaseContinuations(report, previousReport) {
    const entities = Array.isArray(report?.entities) ? report.entities : [];
    const families = Array.isArray(report?.gateBossFamilies) ? report.gateBossFamilies : [];
    if (!entities.length || !families.length) return;
    const previousFamilyMap = previousBossFamilies(previousReport);
    for (const family of families) {
      if (!family?.familyKey || Number(family.aliveMatchedCount) > 0) continue;
      const sameWaveAlive = entities.filter(entity =>
        entity?.source === 'gate' &&
        entity.status === 'alive' &&
        Number(entity.gateId) === Number(family.gateId) &&
        Number(entity.waveId) === Number(family.waveId)
      );
      if (!sameWaveAlive.length) continue;
      const previous = previousFamilyMap.get(family.familyKey);
      const priorRuntimeIds = new Set((previous?.aliveMatchedRuntimeIds || previous?.matchedRuntimeIds || []).map(Number).filter(Number.isFinite));
      let matches = sameWaveAlive.filter(entity => priorRuntimeIds.has(Number(entity.runtimeId)));
      let reason = matches.length ? 'same-runtime-id' : null;
      if (!matches.length) {
        const root = gatePhaseRoot(family.name || previous?.name);
        if (root) {
          const byFamilyRoot = sameWaveAlive.filter(entity => gatePhaseRoot(entity.name) === root);
          if (byFamilyRoot.length === 1) {
            matches = byFamilyRoot;
            reason = 'same-boss-family-name';
          } else if (byFamilyRoot.length > 1) {
            const likelyPhases = byFamilyRoot.filter(entity => /\b(?:divine|sovereign|duelist|phase|herald|emperor|huntress|bastion|basilica|library|court|throne)\b/i.test(entity.name || ''));
            if (likelyPhases.length === 1) {
              matches = likelyPhases;
              reason = 'unique-phase-form';
            }
          }
        }
      }
      if (!matches.length) continue;
      for (const entity of matches) {
        entity.specialType = family.specialType || previous?.specialType || 'timed-boss';
        entity.phaseFamilyKey = family.familyKey;
        entity.timerSlot = family.timerSlot;
        entity.timerName = family.name;
        entity.classifiedByTimer = true;
        entity.targetEligible = true;
        entity.phaseContinuation = {
          recognized: true,
          reason,
          familyKey: family.familyKey,
          logicalName: family.name,
          runtimeName: entity.name,
          runtimeId: entity.runtimeId
        };
      }
      const mergedEntityIds = new Set([...(family.matchedEntityIds || []), ...matches.map(entity => entity.entityId)]);
      const mergedRuntimeIds = new Set([...(family.matchedRuntimeIds || []), ...matches.map(entity => entity.runtimeId)]);
      const aliveMatches = matches.filter(entity => entity.status === 'alive');
      const mergedAliveEntityIds = new Set([...(family.aliveMatchedEntityIds || []), ...aliveMatches.map(entity => entity.entityId)]);
      const mergedAliveRuntimeIds = new Set([...(family.aliveMatchedRuntimeIds || []), ...aliveMatches.map(entity => entity.runtimeId)]);
      family.matchedEntityIds = [...mergedEntityIds];
      family.matchedRuntimeIds = [...mergedRuntimeIds];
      family.aliveMatchedEntityIds = [...mergedAliveEntityIds];
      family.aliveMatchedRuntimeIds = [...mergedAliveRuntimeIds];
      family.matchedCount = family.matchedEntityIds.length;
      family.aliveMatchedCount = family.aliveMatchedEntityIds.length;
      family.phaseContinuation = { recognized: true, reason };
    }
  }
  function annotatePhaseTransitions(report, previousReport) {
    const prevEncounter = previousEntitiesByEncounter(previousReport);
    const prevFamilies = previousBossFamilies(previousReport);
    for (const location of report.dungeonLocations || []) {
      if (location.status !== 'available') continue;
      const key = makeId('dungeon-encounter', [location.instanceId, location.locationId]);
      const old = (prevEncounter.get(key) || []).filter(e => e.status === 'alive');
      const now = (report.entities || []).filter(e => e.encounterKey === key && e.status === 'alive');
      if (!old.length || !now.length) continue;
      const oldIds = new Set(old.map(e => e.runtimeId));
      const newOnes = now.filter(e => !oldIds.has(e.runtimeId));
      const vanished = old.filter(e => !now.some(n => n.runtimeId === e.runtimeId));
      if (newOnes.length && vanished.length) {
        for (const entity of newOnes) {
          entity.phaseTransition = {
            possible: true,
            confidence: 'high',
            reason: 'new dungeon runtime entity appeared in the same still-available location after a previous entity vanished',
            from: vanished.map(v => ({ name: v.name, runtimeId: v.runtimeId }))
          };
        }
      }
    }
    for (const family of report.gateBossFamilies || []) {
      const old = prevFamilies.get(family.familyKey);
      if (!old) continue;
      const oldIds = new Set((old.aliveMatchedRuntimeIds || old.matchedRuntimeIds || []).filter(v => v != null));
      const newIds = new Set((family.aliveMatchedRuntimeIds || family.matchedRuntimeIds || []).filter(v => v != null));
      if (!oldIds.size || !newIds.size) continue;
      const changed = oldIds.size !== newIds.size || [...oldIds].some(id => !newIds.has(id));
      if (!changed && normalizeName(old.name) === normalizeName(family.name)) continue;
      family.phaseTransition = {
        confirmedByFamily: true,
        confidence: 'high',
        from: { name: old.name, runtimeIds: [...oldIds] },
        to: { name: family.name, runtimeIds: [...newIds] },
        reason: 'same timer-classified family now maps to different monster-container runtime entity IDs'
      };
      for (const entityId of family.matchedEntityIds || []) {
        const entity = report.entities.find(e => e.entityId === entityId);
        if (entity) entity.phaseTransition = family.phaseTransition;
      }
    }
  }
  function cleanPotionDisplayName(value) {
    return normalizeSpace(String(value || '')
      .replace(/\s*(?:[x×]\s*[\d,]+|\([x×]\s*[\d,]+\))\s*$/i, '')
      .replace(/\s+qty\s*[:=-]?\s*[\d,]+\s*$/i, ''));
  }
  function quantityFromPotionName(value) {
    const match = String(value || '').match(/(?:[x×]\s*|qty\s*[:=-]?\s*)([\d,]+)\s*\)?\s*$/i);
    return match ? numberFromText(match[1]) : null;
  }
  function classifyPotionName(name) {
    const n = normalizeName(name);
    if (!n || !/\bpotion\b/.test(n)) return null;
    if (/\bmana\b|\bmp\b/.test(n)) return 'mana';
    if (/\bstamina\b/.test(n)) return 'stamina';
    if (/\bhp\b|\bhealth\b/.test(n)) return 'hp';
    return null;
  }
  function parsePotionCards(doc, sourceUrl) {
    const out = [];
    if (!doc?.querySelectorAll) return out;
    const candidates = [
      ...doc.querySelectorAll('.potion-card'),
      ...doc.querySelectorAll('[data-inv][data-item]'),
      ...doc.querySelectorAll('.potion-use-btn[data-inv], button[data-inv][data-item]')
    ];
    for (const node of candidates) {
      const card = node.closest?.('.potion-card,.item-card,.inventory-item,.card,li,tr') || node;
      const button = card.querySelector?.('.potion-use-btn[data-inv],button[data-inv],a[data-inv]') ||
        (node.matches?.('[data-inv]') ? node : null);
      let name = '';
      const named = card.querySelector?.('.name,.item-name,.potion-name,h1,h2,h3,h4,strong,span');
      if (named) name = textOf(named);
      if (!name) name = firstMeaningfulLine(card.textContent || '');
      name = normalizeSpace(name);
      const rawName = name;
      const kind = classifyPotionName(rawName);
      if (!kind) continue;
      name = cleanPotionDisplayName(rawName) || rawName;
      const invId = numberFromText(button?.dataset?.inv ?? card.dataset?.inv);
      const itemId = numberFromText(button?.dataset?.item ?? card.dataset?.item);
      const count = numberFromText(
        button?.dataset?.max ??
        card.dataset?.max ??
        card.dataset?.count ??
        card.querySelector?.('[data-max]')?.dataset?.max ??
        card.querySelector?.('[data-count]')?.dataset?.count
      ) ?? quantityFromPotionName(rawName);
      const cardText = normalizeSpace(card.textContent || '');
      const restorePatterns = kind === 'mana'
        ? [/(?:refill(?:s|ed)?|restore(?:s|d)?|recover(?:s|ed)?|gain(?:s|ed)?|\+)\s*([\d,]+)\s*(?:mp|mana)\b/i, /([\d,]+)\s*(?:mp|mana)\s*(?:refill|restore|recovery|gain)/i]
        : kind === 'stamina'
          ? [/(?:refill(?:s|ed)?|restore(?:s|d)?|recover(?:s|ed)?|gain(?:s|ed)?|\+)\s*([\d,]+)\s*(?:stam(?:ina)?)\b/i, /([\d,]+)\s*(?:stam(?:ina)?)\s*(?:refill|restore|recovery|gain)/i]
          : [];
      let restoreAmount = null;
      for (const pattern of restorePatterns) {
        const match = cardText.match(pattern);
        if (match) { restoreAmount = numberFromText(match[1]); break; }
      }
      if (invId == null && itemId == null && count == null && !card.classList?.contains('potion-card')) continue;
      const stableIdentity = itemId ?? normalizeName(name) ?? invId ?? 'unknown';
      out.push({
        key: ['potion', kind, String(stableIdentity), normalizeName(name)].join('|'),
        legacyKey: ['potion', kind, normalizeName(name), invId ?? itemId ?? 'unknown'].join('|'),
        type: kind,
        name,
        rawName,
        invId,
        itemId,
        count: count ?? 0,
        restoreAmount: Number.isFinite(restoreAmount) && restoreAmount > 0 ? restoreAmount : null,
        sourceUrl,
        discoveredAt: nowIso()
      });
    }
    return uniqueBy(out, p => p.key);
  }
  function parsePlayerResources(doc) {
    if (!doc?.querySelector) return {};
    const parsePair = value => {
      const m = String(value || '').match(/([\d,]+)\s*\/\s*([\d,]+)/);
      if (!m) return null;
      const current = numberFromText(m[1]);
      const max = numberFromText(m[2]);
      return current != null && max != null ? { current, max } : null;
    };
    const out = {};
    const staminaBox = [...doc.querySelectorAll('.gtb-value')].find(el => el.querySelector('#stamina_span'));
    const stamina = parsePair(staminaBox?.textContent || '');
    if (stamina) {
      out.stamina = stamina.current;
      out.staminaMax = stamina.max;
    }
    const expSpans = doc.querySelector('.gtb-exp-top')?.querySelectorAll('span');
    const exp = expSpans?.[1] ? parsePair(expSpans[1].textContent) : null;
    if (exp) {
      out.exp = exp.current;
      out.expMax = exp.max;
    }
    for (const row of doc.querySelectorAll('.resource-row,.player-resource,.res-row')) {
      const label = normalizeName(row.querySelector('.res-label,.label,strong')?.textContent || row.textContent || '');
      const pair = parsePair(row.querySelector('.res-meta,.value')?.textContent || row.textContent || '');
      if (!pair) continue;
      if (/\bhp\b|\bhealth\b/.test(label)) {
        out.hp = pair.current;
        out.hpMax = pair.max;
      } else if (/\bmana\b|\bmp\b/.test(label)) {
        out.mana = pair.current;
        out.manaMax = pair.max;
      }
    }
    return out;
  }
  async function scanResources(rootPage, gateResult) {
    const pages = [];
    const addPage = page => {
      if (!page?.doc) return;
      const key = safeUrl(page.finalUrl || page.url);
      if (pages.some(p => safeUrl(p.finalUrl || p.url) === key)) return;
      pages.push(page);
    };
    addPage(rootPage);
    for (const page of gateResult?.topology?.fetchedWaveDocs?.values?.() || []) addPage(page);
    let potions = [];
    for (const page of pages) {
      potions.push(...parsePotionCards(page.doc, page.finalUrl || page.url));
    }
    const missingPotionFamily = () => {
      const kinds = new Set(potions.map(p => p.type));
      return !kinds.has('mana') || !kinds.has('stamina') || !kinds.has('hp');
    };
    if (missingPotionFamily()) {
      for (const path of CONFIG.resourceInventoryPaths || []) {
        try {
          const page = await getPage(path, 'resources-inventory');
          addPage(page);
          potions.push(...parsePotionCards(page.doc, page.finalUrl || page.url));
          potions = uniqueBy(potions, p => p.key);
          if (!missingPotionFamily()) break;
        } catch (e) {
          state.errors.push({ at: nowIso(), stage: 'resources-inventory', url: path, message: String(e?.message || e) });
        }
      }
    }
    potions = uniqueBy(potions, p => p.key);
    let player = {};
    for (const page of pages) {
      const parsed = parsePlayerResources(page.doc);
      if (Object.keys(parsed).length > Object.keys(player).length) player = parsed;
    }
    return {
      potions,
      player,
      potionCounts: {
        mana: potions.filter(p => p.type === 'mana').length,
        stamina: potions.filter(p => p.type === 'stamina').length,
        hp: potions.filter(p => p.type === 'hp').length
      }
    };
  }
  async function scanDungeons(rootPage) {
    const instances = discoverDungeonInstances(rootPage.doc);
    const dungeons = [];
    const locations = [];
    const entities = [];
    for (const seed of instances) {
      try {
        const page = await getPage(seed.url, `dungeon-entry:${seed.instanceId}`);
        const finalPath = new URL(page.finalUrl).pathname;
        const cube = parseCubeOverview(page.doc, page.finalUrl, seed.instanceId);
        if (cube) {
          cube.entryUrl = seed.url;
          cube.finalUrl = page.finalUrl;
          dungeons.push(cube);
          const cubeResult = await scanCubeDungeon(page, seed, cube);
          locations.push(...cubeResult.locations);
          entities.push(...cubeResult.entities);
          continue;
        }
        const dungeon = parseDungeonInstance(page.doc, page.finalUrl, seed.instanceId);
        dungeon.implementation = /guild_dungeon_instance\.php$/i.test(finalPath) ? 'standard' : 'special-html';
        dungeon.entryUrl = seed.url;
        dungeon.finalUrl = page.finalUrl;
        dungeons.push(dungeon);
        const availableLocations = [];
        for (const location of dungeon.locations) {
          location.implementation = dungeon.implementation;
          locations.push(location);
          if (location.status === 'available' && location.url && location.locationId) availableLocations.push(location);
        }
        const locationResults = await mapWithConcurrency(availableLocations, CONFIG.maxDungeonLocationConcurrency, async location => {
          try {
            const locPage = await getPage(location.url, `dungeon-location:${seed.instanceId}:${location.locationId}`);
            const detail = parseDungeonLocation(locPage.doc, {
              instanceId: seed.instanceId,
              dungeonName: dungeon.name,
              locationId: location.locationId,
              locationName: location.name
            });
            location.serverLeft = detail.left;
            location.serverTotal = detail.total;
            return detail.monsters.map(e => ({ ...e, implementation: dungeon.implementation }));
          } catch (e) {
            state.errors.push({ at: nowIso(), stage: 'dungeon-location', instanceId: seed.instanceId, locationId: location.locationId, message: String(e?.message || e) });
            return [];
          }
        });
        for (const batch of locationResults) entities.push(...batch);
      } catch (e) {
        state.errors.push({ at: nowIso(), stage: 'dungeon-instance', instanceId: seed.instanceId, message: String(e?.message || e) });
      }
    }
    return { dungeons, locations, entities };
  }
  async function scanGates(rootPage, extraBootstrapPages = []) {
    const bootstrapDocs = [
      { doc: rootPage.doc, url: rootPage.finalUrl },
      ...extraBootstrapPages.map(p => ({ doc: p.doc, url: p.finalUrl }))
    ];
    try {
      if (document?.documentElement) {
        bootstrapDocs.push({ doc: document, url: location.href });
      }
    } catch (_) {}
    const topology = await discoverGateTopology(bootstrapDocs);
    const waves = [];
    const entities = [];
    const gateBossFamilies = [];
    for (const link of topology.waves) {
      const key = `${link.gateId}:${link.waveId}`;
      const page = topology.fetchedWaveDocs.get(key);
      if (!page) continue;
      const parsed = parseGateWave(page.doc, link);
      waves.push(parsed);
      entities.push(...parsed.entities);
      gateBossFamilies.push(...parsed.timerBosses);
    }
    return {
      topology: {
        waves: topology.waves.map(w => ({
          gateId: w.gateId,
          gateName: w.gateName || null,
          waveId: w.waveId,
          waveDisplay: w.waveDisplay || w.label || null,
          url: w.url,
          discoveredFrom: w.discoveredFrom
        })),
        hubs: topology.hubs,
        coverage: topology.coverage
      },
      waves,
      entities,
      gateBossFamilies
    };
  }
  function buildTargetRegistry(report) {
    const eligible = (report.entities || []).filter(e => e.targetEligible && e.status === 'alive');
    const byName = {};
    for (const entity of eligible) {
      const key = entity.normalizedName || '(unknown)';
      if (!byName[key]) byName[key] = [];
      byName[key].push(entity.entityId);
    }
    return {
      totalEligible: eligible.length,
      dungeonEligible: eligible.filter(e => e.source === 'dungeon').length,
      gateEligible: eligible.filter(e => e.source === 'gate').length,
      entityIds: eligible.map(e => e.entityId),
      byName
    };
  }
  async function fetchNavigationFallbacks(rootPage) {
    const pages = [];
    const already = new Set([safeUrl(rootPage?.finalUrl || rootPage?.url)]);
    const rootHasGateLinks = collectGateWaveLinks(rootPage.doc, rootPage.finalUrl).length > 0;
    if (rootHasGateLinks) return pages;
    for (const path of CONFIG.navigationFallbackPaths || []) {
      const url = safeUrl(path);
      if (!url || already.has(url)) continue;
      already.add(url);
      try {
        const page = await getPage(url, `bootstrap-fallback:${path}`);
        pages.push(page);
        if (collectGateWaveLinks(page.doc, page.finalUrl).length > 0) break;
      } catch (e) {
        state.errors.push({ at: nowIso(), stage: 'bootstrap-fallback', url, message: String(e?.message || e) });
      }
    }
    return pages;
  }
  function bootstrapDiagnostics(rootPage, fallbackPages) {
    const summarize = page => {
      const doc = page?.doc || document;
      const openHeading = [...doc.querySelectorAll('h1,h2,h3,h4')].find(h => /open\s+dungeons/i.test(textOf(h)));
      const openContainer = openHeading?.nextElementSibling || null;
      const enterLinks = openContainer
        ? [...openContainer.querySelectorAll('a[href],button')].filter(el => /\benter\b/i.test(textOf(el)))
        : [];
      const seeds = discoverDungeonInstances(doc);
      return {
        url: page?.url || null,
        finalUrl: page?.finalUrl || null,
        title: normalizeSpace(doc.title || ''),
        links: doc.querySelectorAll?.('a[href]')?.length || 0,
        openDungeonsHeading: openHeading ? textOf(openHeading) : null,
        openDungeonsEnterControls: enterLinks.length,
        dungeonInstanceSeeds: seeds.length,
        dungeonSeedPreview: seeds.map(x => ({ instanceId: x.instanceId, nameHint: x.nameHint, discoveredBy: x.discoveredBy })),
        gateWaveSeeds: collectGateWaveLinks(doc, page?.finalUrl || page?.url || location.href).length
      };
    };
    return {
      primary: summarize(rootPage),
      fallbacks: (fallbackPages || []).map(summarize),
      foregroundNavigationSeed: {
        url: location.href,
        gateWaveSeeds: collectGateWaveLinks(document, location.href).length
      }
    };
  }
  async function performScan() {
    state.running = true;
    emitScannerEvent('scan-start', { scanSeq: state.scanSeq + 1 });
    state.scanSeq += 1;
    state.lastScanStartedAt = nowIso();
    state.errors = [];
    const startedMs = Date.now();
    const previousReport = state.lastReport;
    try {
      const [rootPage, gatesRootPage] = await Promise.all([
        getPage(CONFIG.dungeonRootPath, 'bootstrap-dungeons'),
        getPage(CONFIG.gatesRootPath, 'bootstrap-gates')
      ]);
      const fallbackPages = await fetchNavigationFallbacks(gatesRootPage);
      const [dungeonResult, gateResult] = await Promise.all([
        scanDungeons(rootPage),
        scanGates(gatesRootPage, fallbackPages)
      ]);
      const resourceResult = await scanResources(rootPage, gateResult);
      const entities = [...dungeonResult.entities, ...gateResult.entities];
      const report = {
        engine: 'AURELIX Core',
        version: VERSION,
        scanSeq: state.scanSeq,
        generatedAt: nowIso(),
        durationMs: Date.now() - startedMs,
        bootstrap: {
          dungeons: bootstrapDiagnostics(rootPage, []),
          gates: bootstrapDiagnostics(gatesRootPage, fallbackPages)
        },
        policy: {
          readOnly: true,
          pageIndependent: true,
          gateTargeting: 'timer-listed boss/general names classify alive-population monster cards; monster-card runtime state is authoritative',
          dungeonTargeting: 'all live monsters in all currently available standard/Cube PvE locations; discovery only',
          phasePolicy: 'dungeon phase replacement continues by location; gate special identity follows timer classification while runtime state follows monster cards',
          lockedDungeonPolicy: 'never fetch/attack locked location; re-discover after progression changes',
          runtimeIdsAreEphemeral: true,
          combatEnabled: false,
          topologyHardcoded: false,
          gatePopulationIsolation: 'transactional hide_dead_monsters=1 GET; original user cookie restored after each Gate request'
        },
        dungeons: dungeonResult.dungeons,
        dungeonLocations: dungeonResult.locations,
        cubeState: dungeonResult.dungeons
          .filter(d => d.implementation === 'cube')
          .map(d => ({
            instanceId: d.instanceId,
            name: d.name,
            currentFaceKey: d.currentFaceKey,
            selectedNodeId: d.selectedNodeId,
            totalClears: d.totalClears,
            actionableNodeIds: d.actionableNodeIds,
            nodes: d.nodes
          })),
        gateTopology: gateResult.topology,
        gateWaves: gateResult.waves.map(w => ({
          gateId: w.gateId,
          gateName: w.gateName,
          waveId: w.waveId,
          waveDisplay: w.waveDisplay,
          url: w.url,
          entityCount: w.entities.length,
          timerBossCount: w.timerBosses.length,
          generalCount: w.generalEntityIds.length,
          population: w.population
        })),
        gateBossFamilies: gateResult.gateBossFamilies,
        resources: resourceResult,
        potions: resourceResult.potions,
        entities,
        targets: null,
        requests: state.requestLog.slice(-24),
        errors: [...state.errors]
      };
      reconcileGatePhaseContinuations(report, previousReport);
      annotatePhaseTransitions(report, previousReport);
      report.targets = buildTargetRegistry(report);
      state.lastReport = report;
      state.lastScanFinishedAt = report.generatedAt;
      emitScannerEvent('scan-complete', { scanSeq: report.scanSeq, report });
      console.log('[AURELIX] Scan complete', {
        seq: report.scanSeq,
        dungeons: report.dungeons.length,
        dungeonLocations: report.dungeonLocations.length,
        gateWaves: report.gateTopology.waves.length,
        entities: report.entities.length,
        eligibleTargets: report.targets.totalEligible,
        errors: report.errors.length,
        durationMs: report.durationMs
      });
      return report;
    } catch (e) {
      if (e?.name === 'AbortError') {
        emitScannerEvent('scan-cancel', { scanSeq: state.scanSeq });
        throw e;
      }
      const failure = {
        at: nowIso(),
        stage: 'scan-root',
        message: String(e?.message || e)
      };
      state.errors.push(failure);
      emitScannerEvent('scan-error', { error: failure });
      warn('Scan failed', failure);
      throw e;
    } finally {
      state.running = false;
      emitScannerEvent('scan-end', { scanSeq: state.scanSeq });
    }
  }
  function scanNow() {
    if (state.inFlight) return state.inFlight;
    const scanController = new AbortController();
    state.scanController = scanController;
    const task = performScan();
    state.inFlight = task;
    return task.finally(() => {
      if (state.inFlight === task) state.inFlight = null;
      if (state.scanController === scanController) state.scanController = null;
    });
  }
  function start() {
    stop();
    const run = () => scanNow().catch(error => {
      if (error?.name !== 'AbortError') console.error('[AURELIX] scheduled scan failed', error);
    });
    void run();
    state.timer = setInterval(run, CONFIG.scanIntervalMs);
    console.log(`[AURELIX] Core started. Interval ${CONFIG.scanIntervalMs} ms.`);
  }
  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.scanController?.abort(new DOMException('Scanner stopped', 'AbortError'));
  }
  function getReport() {
    return state.lastReport;
  }
  function getTargets() {
    if (!state.lastReport) return [];
    const ids = new Set(state.lastReport.targets?.entityIds || []);
    return state.lastReport.entities.filter(e => ids.has(e.entityId));
  }
  function getDungeonTargets() {
    return getTargets().filter(e => e.source === 'dungeon');
  }
  function getGateTargets() {
    return getTargets().filter(e => e.source === 'gate');
  }
  function getDungeons() {
    return state.lastReport?.dungeons || [];
  }
  function getDungeonLocations() {
    return state.lastReport?.dungeonLocations || [];
  }
  function getGateWaves() {
    return state.lastReport?.gateTopology?.waves || [];
  }
  function getScannedGateWaves() {
    return state.lastReport?.gateWaves || [];
  }
  function getGateCoverage() {
    if (!state.lastReport) return null;
    return {
      ...(state.lastReport.gateTopology?.coverage || {}),
      parsed: state.lastReport.gateWaves?.length || 0
    };
  }
  function getCubeState() {
    return state.lastReport?.cubeState || [];
  }
  function copyReport() {
    const json = JSON.stringify(state.lastReport, null, 2);
    if (typeof copy === 'function') {
      copy(json);
      return true;
    }
    return navigator.clipboard.writeText(json).then(() => true);
  }
  function status() {
    return {
      version: VERSION,
      running: state.running,
      scanning: !!state.inFlight,
      scheduled: !!state.timer,
      scanSeq: state.scanSeq,
      lastScanStartedAt: state.lastScanStartedAt,
      lastScanFinishedAt: state.lastScanFinishedAt,
      lastSummary: state.lastReport ? {
        dungeons: state.lastReport.dungeons.length,
        dungeonLocations: state.lastReport.dungeonLocations.length,
        gateWaves: state.lastReport.gateTopology.waves.length,
        gateWavesScanned: state.lastReport.gateWaves.length,
        entities: state.lastReport.entities.length,
        eligibleTargets: state.lastReport.targets.totalEligible,
        errors: state.lastReport.errors.length
      } : null
    };
  }
  window.AURELIX = Object.freeze({
    version: VERSION,
    config: CONFIG,
    scanNow,
    start,
    stop,
    subscribe,
    status,
    getReport,
    getTargets,
    getDungeonTargets,
    getGateTargets,
    getDungeons,
    getDungeonLocations,
    getCubeState,
    getGateWaves,
    getScannedGateWaves,
    getGateCoverage,
    copyReport
  });
  console.log('[AURELIX] Core v' + VERSION + ' loaded.');
  console.log('[AURELIX] API: AURELIX.scanNow(), .status(), .getDungeons(), .getDungeonLocations(), .getCubeState(), .getGateWaves(), .getReport(), .copyReport(), .start(), .stop()');
  if (CONFIG.autoStart) start();
})();
(() => {
  'use strict';
  const ENGINE_VERSION = '0.5.62';
  const ENGINE_STORE = Object.freeze({
    settings: 'aurelix_engine_settings_v030',
    targets: 'aurelix_engine_target_policy_v030',
    catalog: 'aurelix_engine_target_catalog_v031',
    potions: 'aurelix_engine_potion_policy_v030',
    skills: 'aurelix_engine_active_skill_policy_v0512',
    skillCatalog: 'aurelix_engine_active_skill_catalog_v0552',
    skillTargets: 'aurelix_engine_active_skill_targets_v0513',
    manualSnapshot: 'aurelix_engine_manual_snapshot_v0520',
    equipmentPresets: 'aurelix_equipment_presets_v0544',
    petPresets: 'aurelix_pet_presets_v0544',
    loadoutAssignments: 'aurelix_target_loadout_assignments_v0544',
    legacyPresetImport: 'aurelix_legacy_preset_import_v0544'
  });
  const PHASE_RUNTIME_STORE = 'aurelix_engine_phase_runtime_v0542';
  const ENGINE_STATES = Object.freeze({
    OFF: 'OFF',
    STARTING: 'STARTING',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    STOPPING: 'STOPPING',
    ERROR: 'ERROR'
  });
  const DEFAULT_SETTINGS = Object.freeze({
    mode: 'full',
    autoLoot: true,
    expThreshold: 20,
    attackCooldownMs: 140,
    phasePollMs: 1500,
    softOvershootPct: 0.04
  });
  const SLASH_TIERS = Object.freeze([
    { name: 'World Breaker Slash', skillId: -5, stamina: 1000 },
    { name: 'Legendary Slash',skillId: -4, stamina: 200 },
    { name: 'Ultimate Slash',skillId: -3, stamina: 100 },
    { name: 'Heroic Slash', skillId: -2, stamina: 50 },
    { name: 'Power Slash', skillId: -1, stamina: 10 },
    { name: 'Slash',skillId:  0, stamina: 1 }
  ]);
  const clone = value => {
    if (value == null) return value;
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  };
  const normalizeSpace = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalizeName = value => normalizeSpace(value).toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  function safeJsonParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function persistentGet(key, fallback = null) {
    let gmValue;
    let gmReadable = false;
    try {
      if (typeof GM_getValue === 'function') {
        gmReadable = true;
        gmValue = GM_getValue(key, undefined);
        if (gmValue !== undefined) return gmValue;
      }
    } catch (_) {}
    let local = null;
    try { local = localStorage.getItem(key); } catch (_) {}
    if (local !== null) {
      if (gmReadable) {
        try { if (typeof GM_setValue === 'function') GM_setValue(key, local); } catch (_) {}
      }
      return local;
    }
    return fallback;
  }
  function persistentSet(key, value) {
    let ok = false;
    try { if (typeof GM_setValue === 'function') { GM_setValue(key, value); ok = true; } } catch (_) {}
    try { localStorage.setItem(key, value); ok = true; } catch (_) {}
    return ok;
  }
  function loadObject(key, fallback) {
    return safeJsonParse(persistentGet(key, null), clone(fallback));
  }
  function saveObject(key, value) {
    return persistentSet(key, JSON.stringify(value));
  }
  function loadPhaseRuntime() {
    try { return safeJsonParse(sessionStorage.getItem(PHASE_RUNTIME_STORE), {}); } catch (_) { return {}; }
  }
  function savePhaseRuntime(value) {
    try { sessionStorage.setItem(PHASE_RUNTIME_STORE, JSON.stringify(value || {})); return true; } catch (_) { return false; }
  }
  const manualSnapshotAtBoot = loadObject(ENGINE_STORE.manualSnapshot, {});
  function mergedPersistedSection(snapshotKey, storeKey) {
    const snap = manualSnapshotAtBoot?.[snapshotKey];
    const stored = loadObject(storeKey, {});
    return { ...(snap && typeof snap === 'object' ? clone(snap) : {}), ...(stored && typeof stored === 'object' ? stored : {}) };
  }
  function boundedNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function nullableNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function gatePhaseRootEngine(name) {
    const raw = normalizeSpace(name);
    if (!raw) return '';
    const normalized = normalizeName(raw.split(',')[0]);
    return normalized.split(/\s+/)[0] || '';
  }
  function logicalTargetKey(entity) {
    if (!entity || !entity.source) return null;
    if (entity.source === 'gate') {
      const family = normalizeSpace(entity.phaseFamilyKey || '');
      if (family) return `gate-family:${family}`;
      return [
        'gate',
        normalizeName(entity.gateName),
        normalizeName(entity.waveDisplay || entity.waveName || entity.waveId),
        normalizeName(entity.name)
      ].join('|');
    }
    if (entity.source === 'dungeon') {
      return [
        'dungeon',
        normalizeName(entity.dungeonName),
        normalizeName(entity.locationName),
        normalizeName(entity.name)
      ].join('|');
    }
    return null;
  }
  function logicalTargetLabel(entity) {
    return {
      key: logicalTargetKey(entity),
      name: entity?.name || 'Unknown Target',
      source: entity?.source || null,
      gateName: entity?.gateName || null,
      waveName: entity?.waveDisplay || entity?.waveName || null,
      dungeonName: entity?.dungeonName || null,
      locationName: entity?.locationName || null,
      specialType: entity?.specialType || null
    };
  }
  function dungeonBossSlotKey(dungeonName, locationName) {
    return [
      'dungeon-boss-slot',
      normalizeName(dungeonName),
      normalizeName(locationName)
    ].join('|');
  }
  function isNoiseTargetName(name) {
    const n = normalizeName(name);
    return !n ||
      /\bnot\s+joined\b/.test(n) ||
      /^(?:not\s+looted|looted|no\s+loot(?:\s*\([^)]*\))?|unclaimed|claimed)$/.test(n) ||
      /^(?:joined|fight|attack|enter|locked|cleared|available|loot|join)$/.test(n) ||
      /^(?:hp|atk|def|exp)$/.test(n);
  }
  function cleanStoredTargetName(value) {
    return normalizeSpace(String(value || '')
      .replace(/\s+(?:not\s+joined|joined|not\s+looted|looted|unclaimed|claimed|dead|alive|locked)\s*$/i, '')
      .replace(/\s+no\s+loot(?:\s*\([^)]*\))?\s*$/i, ''));
  }
  function saveTargetCatalog() {
    saveObject(ENGINE_STORE.catalog, state.targetCatalog);
  }
  function newerTargetPolicy(candidate, existing) {
    if (!candidate) return existing ? { ...existing } : null;
    if (!existing) return { ...candidate };
    const candidateAt = Number(candidate.updatedAt) || 0;
    const existingAt = Number(existing.updatedAt) || 0;
    // A policy attached to the key currently being canonicalized wins an
    // exact tie. This protects legacy policies that predate updatedAt.
    return { ...(candidateAt >= existingAt ? candidate : existing) };
  }
  function mergeCatalogItem(key, item) {
    if (!key || !item || isNoiseTargetName(item.name)) return null;
    const previous = state.targetCatalog[key] || {};
    const merged = {
      ...previous,
      ...item,
      key,
      firstDiscoveredAt: previous.firstDiscoveredAt || item.firstDiscoveredAt || new Date().toISOString(),
      lastCatalogUpdateAt: new Date().toISOString()
    };
    state.targetCatalog[key] = merged;
    return merged;
  }
  function updateTargetCatalog(report) {
    if (!report) return Object.values(state.targetCatalog);
    const reportToken = `${report.scanSeq ?? ''}:${report.generatedAt ?? ''}`;
    if (reportToken !== ':' && state.lastCatalogReportToken === reportToken) {
      return Object.values(state.targetCatalog);
    }
    for (const [oldKey, item] of Object.entries({ ...state.targetCatalog })) {
      if (!item) {
        delete state.targetCatalog[oldKey];
        delete state.targetPolicy[oldKey];
        delete state.skillTargetPolicy[oldKey];
        delete state.loadoutAssignments[oldKey];
        continue;
      }
      const cleanedName = cleanStoredTargetName(item.name);
      if (!cleanedName || isNoiseTargetName(cleanedName)) {
        delete state.targetCatalog[oldKey];
        delete state.targetPolicy[oldKey];
        delete state.skillTargetPolicy[oldKey];
        delete state.loadoutAssignments[oldKey];
        continue;
      }
      item.name = cleanedName;
      let canonicalKey = oldKey;
      if (item.catalogType === 'dungeon-mob') {
        canonicalKey = logicalTargetKey({
          source: 'dungeon',
          dungeonName: item.dungeonName,
          locationName: item.locationName,
          name: cleanedName
        }) || oldKey;
      }
      if (canonicalKey !== oldKey) {
        const existing = state.targetCatalog[canonicalKey] || {};
        state.targetCatalog[canonicalKey] = { ...item, ...existing, key: canonicalKey, name: cleanedName };
        const migratedPolicy = newerTargetPolicy(state.targetPolicy[oldKey], state.targetPolicy[canonicalKey]);
        if (migratedPolicy) state.targetPolicy[canonicalKey] = migratedPolicy;
        if (state.skillTargetPolicy[oldKey] && !state.skillTargetPolicy[canonicalKey]) {
          state.skillTargetPolicy[canonicalKey] = { ...state.skillTargetPolicy[oldKey] };
        }
        if (state.loadoutAssignments[oldKey] && !state.loadoutAssignments[canonicalKey]) {
          state.loadoutAssignments[canonicalKey] = { ...state.loadoutAssignments[oldKey] };
        }
        delete state.targetCatalog[oldKey];
        delete state.targetPolicy[oldKey];
        delete state.skillTargetPolicy[oldKey];
        delete state.loadoutAssignments[oldKey];
      }
    }
    saveObject(ENGINE_STORE.targets, state.targetPolicy);
    saveObject(ENGINE_STORE.skillTargets, state.skillTargetPolicy);
    saveObject(ENGINE_STORE.loadoutAssignments, state.loadoutAssignments);
    const now = new Date().toISOString();
    const currentEntityIds = new Set();
    for (const item of Object.values(state.targetCatalog)) {
      if (!item || typeof item !== 'object') continue;
      item.currentlyVisible = false;
      if (item.catalogType === 'gate-family') item.status = 'waiting';
      else if (item.catalogType === 'dungeon-mob') item.status = 'not-visible';
      else if (item.catalogType === 'dungeon-boss-slot') {
        item.status = 'waiting';
        delete item.supersededBy;
      }
    }
    for (const family of report.gateBossFamilies || []) {
      if (!family?.familyKey || isNoiseTargetName(family.name)) continue;
      const key = `gate-family:${family.familyKey}`;
      const runtimePhaseNames = [...new Set((family.aliveMatchedEntityIds || [])
        .map(entityId => (report.entities || []).find(entity => entity.entityId === entityId)?.name)
        .filter(Boolean))];
      const displayName = runtimePhaseNames.length === 1 ? runtimePhaseNames[0] : family.name;
      mergeCatalogItem(key, {
        catalogType: 'gate-family',
        source: 'gate',
        name: displayName,
        logicalFamilyName: family.name,
        specialType: family.specialType || 'timed-boss',
        gateId: family.gateId ?? null,
        gateName: family.gateName || null,
        waveId: family.waveId ?? null,
        waveName: family.waveDisplay || null,
        status: Number(family.aliveMatchedCount) > 0 ? 'alive' : 'waiting',
        currentlyVisible: Number(family.matchedCount) > 0,
        aliveRuntimeCount: Number(family.aliveMatchedCount) || 0,
        timerSaysAlive: !!family.timerSaysAlive,
        lastSeenAt: now
      });
    }
    const locations = Array.isArray(report.dungeonLocations) ? report.dungeonLocations : [];
    const locationByRuntime = new Map();
    for (const loc of locations) {
      locationByRuntime.set(`${loc.instanceId}:${loc.locationId}`, loc);
      if (loc?.bossLabel && loc?.dungeonName && loc?.name) {
        const slotKey = dungeonBossSlotKey(loc.dungeonName, loc.name);
        mergeCatalogItem(slotKey, {
          catalogType: 'dungeon-boss-slot',
          source: 'dungeon',
          name: `Boss • ${loc.name}`,
          dungeonName: loc.dungeonName,
          locationName: loc.name,
          status: loc.status || (loc.locked ? 'locked' : 'waiting'),
          locked: !!loc.locked,
          currentlyVisible: loc.status === 'available',
          lastSeenAt: now
        });
      }
    }
    for (const entity of report.entities || []) {
      if (entity?.source !== 'dungeon' || isNoiseTargetName(entity.name)) continue;
      const key = logicalTargetKey(entity);
      if (!key) continue;
      currentEntityIds.add(entity.entityId);
      const previousLineage = Object.values(state.targetCatalog).find(oldItem =>
        oldItem &&
        oldItem.key !== key &&
        oldItem.source === 'dungeon' &&
        oldItem.catalogType === 'dungeon-mob' &&
        normalizeName(oldItem.dungeonName) === normalizeName(entity.dungeonName) &&
        normalizeName(oldItem.locationName) === normalizeName(entity.locationName) &&
        oldItem.runtimeId != null &&
        entity.runtimeId != null &&
        Number(oldItem.runtimeId) === Number(entity.runtimeId)
      );
      if (!state.targetPolicy[key] && previousLineage?.key && state.targetPolicy[previousLineage.key]) {
        state.targetPolicy[key] = { ...state.targetPolicy[previousLineage.key] };
      }
      if (!state.skillTargetPolicy[key] && previousLineage?.key && state.skillTargetPolicy[previousLineage.key]) {
        state.skillTargetPolicy[key] = { ...state.skillTargetPolicy[previousLineage.key] };
      }
      if (!state.loadoutAssignments[key] && previousLineage?.key && state.loadoutAssignments[previousLineage.key]) {
        state.loadoutAssignments[key] = { ...state.loadoutAssignments[previousLineage.key] };
      }
      const item = mergeCatalogItem(key, {
        catalogType: 'dungeon-mob',
        ...logicalTargetLabel(entity),
        status: entity.status || 'unknown',
        currentlyVisible: true,
        runtimeEntityId: entity.entityId || null,
        runtimeId: entity.runtimeId ?? null,
        currentHp: entity.currentHp ?? null,
        maxHp: entity.maxHp ?? null,
        lastSeenAt: now
      });
      const loc = locationByRuntime.get(`${entity.instanceId}:${entity.locationId}`);
      const locationEntityCount = (report.entities || []).filter(candidate =>
        candidate?.source === 'dungeon' &&
        Number(candidate.instanceId) === Number(entity.instanceId) &&
        Number(candidate.locationId) === Number(entity.locationId) &&
        !isNoiseTargetName(candidate.name)
      ).length;
      if (loc?.bossLabel && locationEntityCount === 1 && entity.dungeonName && entity.locationName) {
        const slotKey = dungeonBossSlotKey(entity.dungeonName, entity.locationName);
        const slotPolicy = state.targetPolicy[slotKey];
        const entityPolicy = state.targetPolicy[key];
        if (entityPolicy && !slotPolicy) {
          state.targetPolicy[slotKey] = { ...entityPolicy };
        } else if (slotPolicy && !entityPolicy) {
          state.targetPolicy[key] = { ...slotPolicy };
        } else if (slotPolicy && entityPolicy) {
          const slotTime = Number(slotPolicy.updatedAt) || 0;
          const entityTime = Number(entityPolicy.updatedAt) || 0;
          const winner = entityTime >= slotTime ? entityPolicy : slotPolicy;
          state.targetPolicy[key] = { ...winner };
          state.targetPolicy[slotKey] = { ...winner };
        }
        const slotSkillTarget = state.skillTargetPolicy[slotKey];
        const entitySkillTarget = state.skillTargetPolicy[key];
        if (entitySkillTarget && !slotSkillTarget) {
          state.skillTargetPolicy[slotKey] = { ...entitySkillTarget };
        } else if (slotSkillTarget && !entitySkillTarget) {
          state.skillTargetPolicy[key] = { ...slotSkillTarget };
        } else if (slotSkillTarget && entitySkillTarget) {
          const slotSkillTime = Date.parse(slotSkillTarget.updatedAt || 0) || 0;
          const entitySkillTime = Date.parse(entitySkillTarget.updatedAt || 0) || 0;
          const winnerSkillTarget = entitySkillTime >= slotSkillTime ? entitySkillTarget : slotSkillTarget;
          state.skillTargetPolicy[key] = { ...winnerSkillTarget };
          state.skillTargetPolicy[slotKey] = { ...winnerSkillTarget };
        }
        if (state.targetCatalog[slotKey]) {
          state.targetCatalog[slotKey].supersededBy = key;
          state.targetCatalog[slotKey].status = 'identified';
        }
        const slotLoadout = state.loadoutAssignments[slotKey];
        const entityLoadout = state.loadoutAssignments[key];
        if (entityLoadout && !slotLoadout) state.loadoutAssignments[slotKey] = { ...entityLoadout };
        else if (slotLoadout && !entityLoadout) state.loadoutAssignments[key] = { ...slotLoadout };
      }
    }
    saveObject(ENGINE_STORE.targets, state.targetPolicy);
    saveObject(ENGINE_STORE.skillTargets, state.skillTargetPolicy);
    saveObject(ENGINE_STORE.loadoutAssignments, state.loadoutAssignments);
    saveTargetCatalog();
    if (reportToken !== ':') state.lastCatalogReportToken = reportToken;
    return Object.values(state.targetCatalog);
  }
  class AdaptiveSlashModel {
    constructor() {
      this.damagePerStamina = null;
      this.samples = 0;
    }
    reset() {
      this.damagePerStamina = null;
      this.samples = 0;
    }
    observe({ damage, stamina, critical = false }) {
      let dealt = Number(damage);
      const cost = Number(stamina);
      if (!Number.isFinite(dealt) || dealt <= 0 || !Number.isFinite(cost) || cost <= 0) return;
      const sample = dealt / cost;
      if (!Number.isFinite(sample) || sample <= 0) return;
      if (this.damagePerStamina == null) this.damagePerStamina = sample;
      else this.damagePerStamina = Math.max(this.damagePerStamina, sample);
      this.samples += 1;
    }
    choose({ remainingDamage, damageLimit, staminaAvailable, softOvershootPct = 0.04 }) {
      const remaining = Number(remainingDamage);
      const limit = Math.max(0, Number(damageLimit) || 0);
      const stamina = Number(staminaAvailable);
      if (!(remaining > 0) || !(stamina > 0)) return null;
      if (!(this.damagePerStamina > 0) || this.samples < 1) {
        return stamina >= 1
          ? { ...SLASH_TIERS[SLASH_TIERS.length - 1], estimatedDamage: null, calibration: true }
          : null;
      }
      const tolerance = Math.max(0, limit * Math.max(0, Number(softOvershootPct) || 0));
      const budget = remaining + tolerance;
      for (const tier of SLASH_TIERS) {
        if (tier.stamina > stamina) continue;
        const estimate = this.damagePerStamina * tier.stamina;
        if (estimate <= budget) return { ...tier, estimatedDamage: estimate };
      }
      const smallest = SLASH_TIERS[SLASH_TIERS.length - 1];
      return smallest.stamina <= stamina
        ? { ...smallest, estimatedDamage: this.damagePerStamina * smallest.stamina }
        : null;
    }
    snapshot() {
      return {
        samples: this.samples,
        damagePerStamina: this.damagePerStamina
      };
    }
  }
  const state = {
    status: ENGINE_STATES.OFF,
    settings: {
      ...DEFAULT_SETTINGS,
      ...mergedPersistedSection('settings', ENGINE_STORE.settings)
    },
    targetPolicy: mergedPersistedSection('targets', ENGINE_STORE.targets),
    targetCatalog: mergedPersistedSection('catalog', ENGINE_STORE.catalog),
    potionPolicy: mergedPersistedSection('potions', ENGINE_STORE.potions),
    skillPolicy: mergedPersistedSection('skills', ENGINE_STORE.skills),
    skillTargetPolicy: mergedPersistedSection('skillTargets', ENGINE_STORE.skillTargets),
    equipmentPresets: loadObject(ENGINE_STORE.equipmentPresets, []),
    petPresets: loadObject(ENGINE_STORE.petPresets, []),
    loadoutAssignments: loadObject(ENGINE_STORE.loadoutAssignments, {}),
    activeLoadout: { equipmentPresetId: null, petPresetId: null, detected: false, checkedAt: 0 },
    loadoutInFlight: false,
    loadoutPromise: null,
    failedLoadoutGroups: new Set(),
    failedLoadoutAt: new Map(),
    skillCatalog: mergedPersistedSection('skillCatalog', ENGINE_STORE.skillCatalog),
    session: {
      id: null,
      startedAt: null,
      stoppedAt: null,
      elapsedBeforeStopMs: 0,
      stats: {
        completed: 0,
        attacks: 0,
        damage: 0,
        staminaUsed: 0,
        potions: 0,
        hpPotions: 0,
        staminaPotions: 0,
        manaPotions: 0,
        mobsLooted: 0,
        mobsUnlooted: 0,
        xpLooted: 0,
        errors: 0
      }
    },
    currentTarget: null,
    currentPlan: null,
    lastDecisionAt: null,
    lastScannerSeq: null,
    lastReportGeneratedAt: null,
    lastError: null,
    abortController: null,
    combatLoopPromise: null,
    attackInFlight: false,
    potionInFlight: false,
    lootInFlight: false,
    dungeonLootSweepPending: false,
    dungeonLootSweepPromise: null,
    lastDungeonLootSweepAt: 0,
    potionUsage: {},
    encounterLedger: {},
    phaseProgress: loadPhaseRuntime(),
    phaseWaitLogAt: {},
    phaseWaitPolls: {},
    liveResources: {},
    listeners: new Set(),
    log: [],
    slashModels: new Map(),
    skillDamageModels: new Map(),
    skillDiscoveryPromise: null,
    skillDiscoveryAt: 0,
    directSkillCursor: 0,
    markTurnsByEncounter: {},
    markTotalByEncounter: {},
    observedPotionRestore: {},
    lastCatalogReportToken: null,
    combatPreflight: { key: null, snapshot: null, fetchedAt: 0, actionsSinceFresh: 0 }
  };
  let unsubscribeScanner = null;
  if (window.AURELIX?.subscribe) {
    unsubscribeScanner = window.AURELIX.subscribe(event => {
      if (event.type === 'scan-complete') {
        void refreshActiveSkills(Object.keys(state.skillCatalog).length === 0);
        if (state.status === ENGINE_STATES.RUNNING) {
          state.dungeonLootSweepPending = state.settings.autoLoot !== false;
          if (!state.loadoutInFlight) decideNow();
          ensureCombatLoop();
        }
      }
    });
  }
  function getUiState() {
    return {
      engineVersion: ENGINE_VERSION,
      state: state.status,
      running: state.status === ENGINE_STATES.RUNNING,
      paused: state.status === ENGINE_STATES.PAUSED,
      settings: state.settings,
      sessionId: state.session.id,
      startedAt: state.session.startedAt,
      stoppedAt: state.session.stoppedAt,
      elapsedMs: runtimeElapsedMs(),
      summary: state.session.stats,
      resources: { ...(window.AURELIX?.getReport?.()?.resources?.player || {}), ...state.liveResources },
      currentTarget: state.currentTarget,
      currentPlan: state.currentPlan,
      lastDecisionAt: state.lastDecisionAt,
      lastScannerSeq: state.lastScannerSeq,
      lastReportGeneratedAt: state.lastReportGeneratedAt,
      lastError: state.lastError,
      liveActionsEnabled: true,
      attackInFlight: state.attackInFlight,
      loadoutInFlight: state.loadoutInFlight,
      activeLoadout: clone(state.activeLoadout),
      potionInFlight: state.potionInFlight,
      lootInFlight: state.lootInFlight
    };
  }
  function emit(extra = null) {
    const snapshot = getUiState();
    if (extra && typeof extra === 'object') Object.assign(snapshot, extra);
    for (const listener of [...state.listeners]) {
      try { listener(snapshot); } catch (_) {}
    }
  }
  function pushLog(type, message, data = null) {
    const entry = {
      at: new Date().toISOString(),
      type: String(type || 'system'),
      message: String(message || ''),
      data: data == null ? null : clone(data)
    };
    state.log.push(entry);
    if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
    if (entry.type === 'error') console.error(`[AURELIX:ERROR] ${entry.message}`);
    emit({ latestLog: entry });
    return entry;
  }
  function normalizeSettings(next) {
    const mode = ['full', 'gate', 'dungeon'].includes(next?.mode) ? next.mode : DEFAULT_SETTINGS.mode;
    return {
      mode,
      autoLoot: next?.autoLoot !== false,
      expThreshold: Math.round(boundedNumber(next?.expThreshold, DEFAULT_SETTINGS.expThreshold, 1, 99)),
      attackCooldownMs: Math.round(boundedNumber(next?.attackCooldownMs, DEFAULT_SETTINGS.attackCooldownMs, 120, 5000)),
      phasePollMs: Math.round(boundedNumber(next?.phasePollMs, DEFAULT_SETTINGS.phasePollMs, 1500, 10_000)),
      softOvershootPct: boundedNumber(next?.softOvershootPct, DEFAULT_SETTINGS.softOvershootPct, 0, 0.10)
    };
  }
  state.settings = normalizeSettings(state.settings);
  {
    let speedMigrated = false;
    if ([700, 550, 350, 250].includes(state.settings.attackCooldownMs)) { state.settings.attackCooldownMs = 140; speedMigrated = true; }
    if (state.settings.phasePollMs === 2500) { state.settings.phasePollMs = 1500; speedMigrated = true; }
    if (speedMigrated) saveObject(ENGINE_STORE.settings, state.settings);
  }
  function setSettings(patch) {
    state.settings = normalizeSettings({ ...state.settings, ...(patch || {}) });
    saveObject(ENGINE_STORE.settings, state.settings);
    if (state.status === ENGINE_STATES.RUNNING) decideNow();
    pushLog('system', 'Engine settings updated.', state.settings);
    return getSettings();
  }
  function getSettings() {
    return clone(state.settings);
  }
  function discoverLogicalTargets(report = window.AURELIX?.getReport?.()) {
    updateTargetCatalog(report);
    return Object.values(state.targetCatalog)
      .filter(item => item && !item.supersededBy)
      .sort((a, b) => {
        if (a.source !== b.source) return a.source === 'gate' ? -1 : 1;
        const ap = [a.gateName, a.waveName, a.dungeonName, a.locationName, a.name].filter(Boolean).join(' ');
        const bp = [b.gateName, b.waveName, b.dungeonName, b.locationName, b.name].filter(Boolean).join(' ');
        return ap.localeCompare(bp);
      });
  }
  function stableAssignmentKey(target) {
    if (!target) return '';
    const identity = target.source === 'gate'
      ? [target.source, target.gateName, target.waveName, target.logicalFamilyName || target.name]
      : [target.source, target.dungeonName, target.locationName, target.logicalFamilyName || target.name];
    return `stable:${identity.map(normalizeName).join('|')}`;
  }
  function assignmentForTarget(target, exactKey = target?.key) {
    const exact = exactKey ? state.loadoutAssignments[exactKey] : null;
    const stableKey = stableAssignmentKey(target);
    let stable = stableKey ? state.loadoutAssignments[stableKey] : null;
    if (!exact && !stable && stableKey) {
      for (const [oldKey, assignment] of Object.entries(state.loadoutAssignments)) {
        if (oldKey.startsWith('stable:')) continue;
        const oldTarget = state.targetCatalog[oldKey];
        if (oldTarget && stableAssignmentKey(oldTarget) === stableKey) {
          stable = assignment;
          state.loadoutAssignments[stableKey] = { ...normalizeLoadoutAssignment(assignment), migratedAt:new Date().toISOString() };
          saveObject(ENGINE_STORE.loadoutAssignments, state.loadoutAssignments);
          break;
        }
      }
    }
    return normalizeLoadoutAssignment(exact || stable || {});
  }
  function getTargetPolicies() {
    const logical = discoverLogicalTargets();
    return logical.map(target => {
      const stored = state.targetPolicy[target.key] || {};
      return {
        ...clone(target),
        enabled: stored.enabled === true,
        damageLimit: Math.max(0, Number(stored.damageLimit) || 0),
        phase1DamageLimit: Math.max(0, Number(stored.phase1DamageLimit ?? stored.damageLimit) || 0),
        phase3DamageLimit: Math.max(0, Number(stored.phase3DamageLimit) || 0),
        phaseCapable: isSupportedPhaseTargetName([target.name, target.logicalFamilyName].filter(Boolean).join(' ')),
        equipmentPresetId: assignmentForTarget(target).equipmentPresetId,
        petPresetId: assignmentForTarget(target).petPresetId,
        activeSkillEnabled: state.skillTargetPolicy[target.key]?.enabled === true
      };
    });
  }
  function getTargetUiModels() {
    const logical = discoverLogicalTargets();
    return logical.map(target => {
      const stored = state.targetPolicy[target.key] || {};
      return {
        key: target.key,
        name: target.name || 'Unknown Target',
        source: target.source || null,
        gateName: target.gateName || null,
        waveName: target.waveName || null,
        dungeonName: target.dungeonName || null,
        locationName: target.locationName || null,
        status: target.status || 'waiting',
        enabled: stored.enabled === true,
        damageLimit: Math.max(0, Number(stored.damageLimit) || 0),
        phase1DamageLimit: Math.max(0, Number(stored.phase1DamageLimit ?? stored.damageLimit) || 0),
        phase3DamageLimit: Math.max(0, Number(stored.phase3DamageLimit) || 0),
        phaseCapable: isSupportedPhaseTargetName([target.name, target.logicalFamilyName].filter(Boolean).join(' ')),
        equipmentPresetId: assignmentForTarget(target).equipmentPresetId,
        petPresetId: assignmentForTarget(target).petPresetId,
        activeSkillEnabled: state.skillTargetPolicy[target.key]?.enabled === true
      };
    });
  }
  function mirrorDungeonBossPolicy(key, policy) {
    const item = state.targetCatalog[key];
    if (!item || item.source !== 'dungeon' || !item.dungeonName || !item.locationName) return;
    const slotKey = dungeonBossSlotKey(item.dungeonName, item.locationName);
    const slot = state.targetCatalog[slotKey];
    const isBossTarget = item.catalogType === 'dungeon-boss-slot' || slot?.supersededBy === key || item.supersededBy === slotKey;
    if (!isBossTarget) return;
    state.targetPolicy[slotKey] = { ...policy };
    for (const candidate of Object.values(state.targetCatalog)) {
      if (!candidate || candidate.source !== 'dungeon' || candidate.catalogType !== 'dungeon-mob') continue;
      if (normalizeName(candidate.dungeonName) !== normalizeName(item.dungeonName)) continue;
      if (normalizeName(candidate.locationName) !== normalizeName(item.locationName)) continue;
      if (slot?.supersededBy && candidate.key !== slot.supersededBy && candidate.key !== key) continue;
      if (candidate.key) state.targetPolicy[candidate.key] = { ...policy };
    }
  }
  function setTargetPolicy(key, patch) {
    if (!key || typeof key !== 'string') return false;
    const current = state.targetPolicy[key] || {};
    const next = {
      enabled: patch?.enabled != null ? !!patch.enabled : !!current.enabled,
      damageLimit: patch?.damageLimit != null
        ? Math.max(0, Math.floor(Number(patch.damageLimit) || 0))
        : Math.max(0, Math.floor(Number(current.damageLimit) || 0)),
      phase1DamageLimit: patch?.phase1DamageLimit != null
        ? Math.max(0, Math.floor(Number(patch.phase1DamageLimit) || 0))
        : Math.max(0, Math.floor(Number(current.phase1DamageLimit ?? current.damageLimit) || 0)),
      phase3DamageLimit: patch?.phase3DamageLimit != null
        ? Math.max(0, Math.floor(Number(patch.phase3DamageLimit) || 0))
        : Math.max(0, Math.floor(Number(current.phase3DamageLimit) || 0)),
      updatedAt: Date.now()
    };
    state.targetPolicy[key] = next;
    const phaseProgress = state.phaseProgress[key];
    const enabledChanged = patch?.enabled != null && !!current.enabled !== !!next.enabled;
    const phase1Changed = patch?.phase1DamageLimit != null && Number(current.phase1DamageLimit ?? current.damageLimit ?? 0) !== Number(next.phase1DamageLimit);
    if (!next.enabled || enabledChanged || phase1Changed) {
      delete state.phaseProgress[key];
      delete state.phaseWaitPolls[key];
      savePhaseRuntime(state.phaseProgress);
    } else if (phaseProgress?.stage === 'complete' && patch?.phase3DamageLimit != null && Number(next.phase3DamageLimit) > 0) {
      phaseProgress.stage = 'phase3';
      savePhaseRuntime(state.phaseProgress);
    }
    mirrorDungeonBossPolicy(key, next);
    const saved = saveObject(ENGINE_STORE.targets, state.targetPolicy);
    if (!saved) pushLog('error', `Target policy persistence failed for ${key}.`);
    decideNow();
    emit();
    return saved !== false;
  }
  function bulkSetTargetPolicies(items) {
    if (!Array.isArray(items)) return false;
    for (const item of items) {
      if (!item?.key) continue;
      const current = state.targetPolicy[item.key] || {};
      state.targetPolicy[item.key] = {
        enabled: item.enabled != null ? !!item.enabled : !!current.enabled,
        damageLimit: item.damageLimit != null
          ? Math.max(0, Math.floor(Number(item.damageLimit) || 0))
          : Math.max(0, Math.floor(Number(current.damageLimit) || 0)),
        phase1DamageLimit: item.phase1DamageLimit != null
          ? Math.max(0, Math.floor(Number(item.phase1DamageLimit) || 0))
          : Math.max(0, Math.floor(Number(current.phase1DamageLimit ?? current.damageLimit) || 0)),
        phase3DamageLimit: item.phase3DamageLimit != null
          ? Math.max(0, Math.floor(Number(item.phase3DamageLimit) || 0))
          : Math.max(0, Math.floor(Number(current.phase3DamageLimit) || 0)),
        updatedAt: Date.now()
      };
      const phaseProgress = state.phaseProgress[item.key];
      const next = state.targetPolicy[item.key];
      const enabledChanged = item.enabled != null && !!current.enabled !== !!next.enabled;
      const phase1Changed = item.phase1DamageLimit != null && Number(current.phase1DamageLimit ?? current.damageLimit ?? 0) !== Number(next.phase1DamageLimit);
      if (!next.enabled || enabledChanged || phase1Changed) {
        delete state.phaseProgress[item.key];
        delete state.phaseWaitPolls[item.key];
      } else if (phaseProgress?.stage === 'complete' && item.phase3DamageLimit != null && Number(next.phase3DamageLimit) > 0) {
        phaseProgress.stage = 'phase3';
      }
      mirrorDungeonBossPolicy(item.key, state.targetPolicy[item.key]);
    }
    const saved = saveObject(ENGINE_STORE.targets, state.targetPolicy);
    if (!saved) pushLog('error', 'Bulk target-policy persistence failed.');
    savePhaseRuntime(state.phaseProgress);
    decideNow();
    emit();
    return saved !== false;
  }
  function potionKind(potion) {
    return normalizeName(potion?.type || (/\bmana\b|\bmp\b/i.test(potion?.name || '') ? 'mana' : /\bstamina\b/i.test(potion?.name || '') ? 'stamina' : /\bhp\b|\bhealth\b/i.test(potion?.name || '') ? 'hp' : ''));
  }
  function potionBaseName(value) {
    return normalizeName(String(value || '')
      .replace(/\s*(?:[x×]\s*[\d,]+|\([x×]\s*[\d,]+\))\s*$/i, '')
      .replace(/\s+qty\s*[:=-]?\s*[\d,]+\s*$/i, ''));
  }
  function stablePotionNamePolicyKey(potion) {
    if (!potion) return null;
    const kind = potionKind(potion);
    const name = potionBaseName(potion.name || potion.rawName || '');
    return kind && name ? ['potion-policy', kind, name].join('|') : null;
  }
  function stablePotionPolicyKey(potion) {
    if (!potion) return null;
    const kind = potionKind(potion);
    const name = potionBaseName(potion.name || potion.rawName || '');
    const itemId = potion.itemId ?? potion.item;
    const identity = itemId != null ? `item:${itemId}` : (name || String(potion.invId ?? potion.inv_id ?? 'unknown'));
    return ['potion', kind, identity, name].join('|');
  }
  function potionPolicyKeyCandidates(potion) {
    if (!potion) return [];
    const kind = potionKind(potion);
    const name = potionBaseName(potion.name || potion.rawName || '');
    const rawName = normalizeName(potion.rawName || potion.name || '');
    const invId = potion.invId ?? potion.inv_id;
    const itemId = potion.itemId ?? potion.item;
    const keys = [
      stablePotionNamePolicyKey(potion),
      stablePotionPolicyKey(potion),
      potion.key,
      potion.legacyKey,
      ['potion-name', kind, name].join('|'),
      rawName && rawName !== name ? ['potion-policy', kind, rawName].join('|') : null,
      rawName && rawName !== name ? ['potion-name', kind, rawName].join('|') : null,
      ['potion', kind, name, invId ?? itemId ?? 'unknown'].join('|'),
      ['potion', kind, invId ?? itemId ?? 'unknown', name].join('|')
    ].filter(Boolean);
    return [...new Set(keys)];
  }
  function legacyPotionPolicyFor(potion) {
    const kind = potionKind(potion);
    const baseName = potionBaseName(potion?.name || potion?.rawName || '');
    if (!kind || !baseName) return null;
    const candidates = [];
    for (const [key, value] of Object.entries(state.potionPolicy || {})) {
      const parts = String(key).split('|');
      if (!parts.includes(kind)) continue;
      if (!parts.some(part => potionBaseName(part) === baseName)) continue;
      candidates.push({ key, policy: normalizePotionPolicy(value) });
    }
    if (!candidates.length) return null;
    // Legacy aliases were historically written together. If stale conflicting aliases
    // exist, preserve an explicitly configured policy rather than falling back to the
    // default disabled/0 state that caused intermittent scanner resets.
    candidates.sort((a, b) =>
      Number(b.policy.enabled) - Number(a.policy.enabled) ||
      Number(b.policy.limit > 0) - Number(a.policy.limit > 0) ||
      b.policy.limit - a.policy.limit
    );
    return candidates[0];
  }
  function normalizePotionPolicy(policy) {
    return {
      enabled: policy?.enabled === true,
      limit: Math.max(0, Math.floor(Number(policy?.limit) || 0))
    };
  }
  function writePotionPolicyAliases(potion, policy) {
    const normalized = normalizePotionPolicy(policy);
    const keys = potionPolicyKeyCandidates(potion);
    for (const key of keys) state.potionPolicy[key] = { ...normalized };
    return keys;
  }
  function policyForPotion(potion) {
    const canonicalKey = stablePotionNamePolicyKey(potion) || stablePotionPolicyKey(potion) || potion?.key;
    let found = null;
    for (const key of potionPolicyKeyCandidates(potion)) {
      const candidate = state.potionPolicy[key];
      if (!candidate) continue;
      found = normalizePotionPolicy(candidate);
      break;
    }
    if (!found) {
      const legacy = legacyPotionPolicyFor(potion);
      if (legacy) found = legacy.policy;
    }
    if (!found) return { key: canonicalKey, policy: {} };
    let changed = false;
    for (const key of potionPolicyKeyCandidates(potion)) {
      const existing = state.potionPolicy[key];
      if (!existing || existing.enabled !== found.enabled || Math.max(0, Math.floor(Number(existing.limit) || 0)) !== found.limit) {
        state.potionPolicy[key] = { ...found };
        changed = true;
      }
    }
    if (changed) saveObject(ENGINE_STORE.potions, state.potionPolicy);
    return { key: canonicalKey, policy: found };
  }
  function migratePotionPoliciesFromReport() {
    const raw = window.AURELIX?.getReport?.()?.potions || window.AURELIX?.getReport?.()?.resources?.potions || [];
    const potions = Array.isArray(raw) ? raw : Object.values(raw || {});
    let changed = false;
    for (const potion of potions) {
      const resolved = policyForPotion(potion);
      if (!resolved.policy || resolved.policy.enabled == null) continue;
      const canonicalKey = stablePotionNamePolicyKey(potion);
      if (canonicalKey) {
        const normalized = normalizePotionPolicy(resolved.policy);
        const current = state.potionPolicy[canonicalKey];
        if (!current || current.enabled !== normalized.enabled || Math.max(0, Math.floor(Number(current.limit) || 0)) !== normalized.limit) {
          state.potionPolicy[canonicalKey] = { ...normalized };
          changed = true;
        }
      }
    }
    if (changed) saveObject(ENGINE_STORE.potions, state.potionPolicy);
    return changed;
  }
  function getPotionPolicy() {
    migratePotionPoliciesFromReport();
    return clone(state.potionPolicy);
  }
  function getPotionModels() {
    migratePotionPoliciesFromReport();
    const raw = window.AURELIX?.getReport?.()?.potions || window.AURELIX?.getReport?.()?.resources?.potions || [];
    const potions = Array.isArray(raw) ? raw : Object.values(raw || {});
    return potions.map(potion => {
      const resolved = policyForPotion(potion);
      const policy = normalizePotionPolicy(resolved.policy || {});
      return {
        ...clone(potion),
        name: String(potion.name || '').replace(/\s*(?:[x×]\s*[\d,]+|\([x×]\s*[\d,]+\))\s*$/i, '').trim() || potion.name,
        key: resolved.key || stablePotionNamePolicyKey(potion) || stablePotionPolicyKey(potion) || potion.key,
        type: potionKind(potion),
        enabled: policy.enabled,
        limit: policy.limit
      };
    });
  }
  function setPotionPolicy(key, patch) {
    if (!key) return false;
    const raw = window.AURELIX?.getReport?.()?.potions || window.AURELIX?.getReport?.()?.resources?.potions || [];
    const potions = Array.isArray(raw) ? raw : Object.values(raw || {});
    const potion = potions.find(p => potionPolicyKeyCandidates(p).includes(key));
    const canonicalKey = potion ? (stablePotionNamePolicyKey(potion) || stablePotionPolicyKey(potion)) : key;
    const current = potion ? (policyForPotion(potion).policy || {}) : (state.potionPolicy[canonicalKey] || state.potionPolicy[key] || {});
    const next = {
      enabled: patch?.enabled != null ? !!patch.enabled : current.enabled === true,
      limit: patch?.limit != null ? Math.max(0, Math.floor(Number(patch.limit) || 0)) : Math.max(0, Math.floor(Number(current.limit) || 0))
    };
    if (next.enabled && potion) {
      const type = potionKind(potion);
      for (const otherPotion of potions) {
        if (otherPotion === potion || potionKind(otherPotion) !== type) continue;
        const otherPolicy = policyForPotion(otherPotion).policy || {};
        writePotionPolicyAliases(otherPotion, { enabled: false, limit: otherPolicy.limit });
      }
    }
    if (potion) writePotionPolicyAliases(potion, next);
    else state.potionPolicy[canonicalKey] = { ...next };
    const saved = saveObject(ENGINE_STORE.potions, state.potionPolicy);
    if (!saved) pushLog('error', `Potion policy persistence failed for ${canonicalKey}.`);
    emit();
    return saved !== false;
  }
  function sourceAllowed(entity) {
    if (state.settings.mode === 'full') return true;
    return entity.source === state.settings.mode;
  }
  function candidateScore(entity) {
    let group = entity.source === 'gate' ? 10 : 30;
    if (entity.specialType === 'grakthar-general') group = 5;
    else if (entity.specialType === 'timed-boss') group = 6;
    if (entity.phaseWaiting) group += 100;
    const expiry = Number(entity.expireAtUnix);
    const expiryScore = Number.isFinite(expiry) && expiry > 0 ? expiry : Number.MAX_SAFE_INTEGER;
    return { group, expiryScore, name: normalizeName(entity.name), runtimeId: Number(entity.runtimeId) || 0 };
  }
  function compareCandidates(a, b) {
    const aa = candidateScore(a);
    const bb = candidateScore(b);
    if (aa.group !== bb.group) return aa.group - bb.group;
    if (aa.expiryScore !== bb.expiryScore) return aa.expiryScore - bb.expiryScore;
    const byName = aa.name.localeCompare(bb.name);
    if (byName) return byName;
    return aa.runtimeId - bb.runtimeId;
  }
  function isSupportedPhaseTargetName(name) {
    const normalized = normalizeName(name);
    if (/\b(?:orion|pan)\b/.test(normalized)) return false;
    if (/\bposeidon\b/.test(normalized)) {
      if (/\bsea\s+emperor\b/.test(normalized)) return false;
      return /\bsovereign\b.*\bdrowned\s+steps\b/.test(normalized);
    }
    if (/\bzeus\b/.test(normalized)) {
      return /\bsovereign\b.*\bstorm\s+throne\b/.test(normalized);
    }
    return /\b(?:ares|apollo|hermes|artemis|hera|athena)\b/.test(normalized);
  }
  function phasePolicyLimits(policy, targetName = '', policyKey = '') {
    const catalog = state.targetCatalog[policyKey] || {};
    const identity = [targetName, catalog.name, catalog.logicalFamilyName].filter(Boolean).join(' ');
    return {
      phase1: Math.max(0, Number(policy?.phase1DamageLimit ?? policy?.damageLimit) || 0),
      phase3: isSupportedPhaseTargetName(identity) ? Math.max(0, Number(policy?.phase3DamageLimit) || 0) : 0
    };
  }
  function phaseProgressKey(target) {
    return target?.policyKey || target?.logicalKey || logicalTargetKey(target) || 'unknown';
  }
  function getPhaseProgress(target) {
    const key = phaseProgressKey(target);
    if (!state.phaseProgress[key]) state.phaseProgress[key] = { stage: 'phase1', phase3Baseline: null, phase3RuntimeKey: null };
    const progress = state.phaseProgress[key];
    const runtimeKey = runtimeEncounterKey(target);
    if ((progress.stage === 'complete' || progress.stage === 'phase3') && progress.phase3RuntimeKey && progress.phase3RuntimeKey !== runtimeKey) {
      state.phaseProgress[key] = { stage: 'phase1', phase3Baseline: null, phase3RuntimeKey: null };
      savePhaseRuntime(state.phaseProgress);
    }
    return state.phaseProgress[key];
  }
  function markPhase3(target) {
    const progress = getPhaseProgress(target);
    delete state.phaseWaitPolls[phaseProgressKey(target)];
    progress.stage = 'phase3';
    progress.phase3Baseline = null;
    progress.phase3RuntimeKey = null;
    delete state.encounterLedger[runtimeEncounterKey(target)];
    target.currentUserDamage = null;
    target.userDamage = null;
    savePhaseRuntime(state.phaseProgress);
    return progress;
  }
  function applyCurrentPhaseBudget(target, cumulativeDamage) {
    const limits = { phase1: Number(target.phase1DamageLimit) || 0, phase3: Number(target.phase3DamageLimit) || 0 };
    const progress = getPhaseProgress(target);
    if (progress.stage !== 'phase3') {
      target.phaseStage = 'phase1';
      target.damageLimit = limits.phase1;
      if (state.currentTarget && sameRuntimeTarget(state.currentTarget, target)) {
        state.currentTarget.phaseStage = 'phase1';
        state.currentTarget.damageLimit = limits.phase1;
        state.currentTarget.phase1DamageLimit = limits.phase1;
      }
      return target;
    }
    let changed = false;
    if (!Number.isFinite(progress.phase3Baseline)) {
      progress.phase3Baseline = Math.max(0, Number(cumulativeDamage) || 0);
      changed = true;
    }
    const runtimeKey = runtimeEncounterKey(target);
    if (progress.phase3RuntimeKey !== runtimeKey) {
      progress.phase3RuntimeKey = runtimeKey;
      changed = true;
    }
    target.phaseStage = 'phase3';
    target.phase3Baseline = progress.phase3Baseline;
    target.damageLimit = progress.phase3Baseline + limits.phase3;
    if (state.currentTarget && sameRuntimeTarget(state.currentTarget, target)) {
      Object.assign(state.currentTarget, {
        phaseStage:'phase3',
        phase3Baseline:progress.phase3Baseline,
        phase3DamageLimit:limits.phase3,
        damageLimit:target.damageLimit
      });
    }
    if (changed) savePhaseRuntime(state.phaseProgress);
    return target;
  }
  function buildCandidates(report) {
    const entities = Array.isArray(report?.entities) ? report.entities : [];
    const candidates = [];
    for (const entity of entities) {
      if (entity?.status !== 'alive') continue;
      if (!entity.targetEligible && entity.source === 'gate') {
        const root = gatePhaseRootEngine(entity.name);
        const family = (report.gateBossFamilies || []).find(candidate =>
          root &&
          Number(candidate.gateId) === Number(entity.gateId) &&
          Number(candidate.waveId) === Number(entity.waveId) &&
          gatePhaseRootEngine(candidate.name) === root &&
          state.targetPolicy[`gate-family:${candidate.familyKey}`]?.enabled === true
        );
        if (family) {
          entity.specialType = family.specialType || 'timed-boss';
          entity.phaseFamilyKey = family.familyKey;
          entity.classifiedByTimer = true;
          entity.targetEligible = true;
        }
      }
      if (!entity.targetEligible) continue;
      if (!sourceAllowed(entity)) continue;
      const logicalKey = logicalTargetKey(entity);
      if (!logicalKey) continue;
      let policy = state.targetPolicy[logicalKey];
      let policyKey = logicalKey;
      if ((!policy?.enabled || !Object.values(phasePolicyLimits(policy, entity.name, logicalKey)).some(v => v > 0)) && entity.source === 'dungeon') {
        const loc = (report.dungeonLocations || []).find(x =>
          Number(x.instanceId) === Number(entity.instanceId) &&
          Number(x.locationId) === Number(entity.locationId)
        );
        if (loc?.bossLabel) {
          const slotKey = dungeonBossSlotKey(entity.dungeonName, entity.locationName || loc.name);
          const slotPolicy = state.targetPolicy[slotKey];
          if (slotPolicy?.enabled && Object.values(phasePolicyLimits(slotPolicy, entity.name, slotKey)).some(v => v > 0)) {
            policy = slotPolicy;
            policyKey = slotKey;
          }
        }
      }
      if (!policy?.enabled) continue;
      const phaseLimits = phasePolicyLimits(policy, entity.name, policyKey);
      if (!(phaseLimits.phase1 > 0 || phaseLimits.phase3 > 0)) continue;
      const encounterKey = runtimeEncounterKey(entity);
      const ledgerDamage = Number(state.encounterLedger[encounterKey]?.damage);
      const scannedDamage = Number(entity.userDamage);
      const knownValues = [scannedDamage, ledgerDamage].filter(v => Number.isFinite(v) && v >= 0);
      const userDamage = knownValues.length ? Math.max(...knownValues) : null;
      const damageKnown = Number.isFinite(userDamage) && userDamage >= 0;
      const phaseProgress = getPhaseProgress({ ...entity, logicalKey, policyKey });
      if (phaseProgress.stage === 'complete' && phaseProgress.phase3RuntimeKey === encounterKey) continue;
      const inPhase3 = phaseProgress.stage === 'phase3';
      const damageLimit = inPhase3 && Number.isFinite(phaseProgress.phase3Baseline)
        ? phaseProgress.phase3Baseline + phaseLimits.phase3
        : phaseLimits.phase1;
      const phaseWaiting = !inPhase3 && phaseLimits.phase3 > 0 && (!(phaseLimits.phase1 > 0) || (damageKnown && userDamage >= phaseLimits.phase1));
      if (!phaseWaiting && damageKnown && userDamage >= damageLimit) continue;
      if (inPhase3 && !(phaseLimits.phase3 > 0)) continue;
      const loadoutAssignment = assignmentForTarget(entity, policyKey);
      const requiredLoadoutKey = loadoutGroupKey(loadoutAssignment);
      if (loadoutGroupBlocked(requiredLoadoutKey)) continue;
      candidates.push({
        ...entity,
        logicalKey,
        policyKey,
        encounterKey,
        damageLimit,
        phase1DamageLimit: phaseLimits.phase1,
        phase3DamageLimit: phaseLimits.phase3,
        phaseStage: inPhase3 ? 'phase3' : 'phase1',
        phaseWaiting,
        loadoutAssignment,
        requiredLoadoutKey,
        currentUserDamage: damageKnown ? userDamage : null,
        remainingDamage: damageKnown ? Math.max(0, damageLimit - userDamage) : null,
        requiresDamageVerification: !damageKnown || entity.source === 'dungeon'
      });
    }
    candidates.sort((a, b) => {
      const aReady = !a.phaseWaiting && activeLoadoutMatches(a.loadoutAssignment) ? 1 : 0;
      const bReady = !b.phaseWaiting && activeLoadoutMatches(b.loadoutAssignment) ? 1 : 0;
      if (aReady !== bReady) return bReady - aReady;
      return compareCandidates(a, b);
    });
    return candidates;
  }
  function makePlan(entity) {
    if (!entity) return null;
    return {
      type: 'combat-target',
      createdAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      logicalKey: entity.logicalKey,
      source: entity.source,
      entityId: entity.entityId,
      runtimeId: entity.runtimeId,
      battleUrl: entity.battleUrl,
      targetName: entity.name,
      damageLimit: entity.damageLimit,
      currentUserDamage: entity.currentUserDamage,
      remainingDamage: entity.remainingDamage,
      requiresDamageVerification: entity.requiresDamageVerification,
      nextStage: entity.requiresDamageVerification ? 'verify-damage' : 'join-or-attack',
      liveActionsEnabled: true
    };
  }
  function decideNow() {
    if (state.status !== ENGINE_STATES.RUNNING) return null;
    if (state.loadoutInFlight) return clone(state.currentPlan);
    const scanner = window.AURELIX;
    const report = scanner?.getReport?.();
    state.lastDecisionAt = new Date().toISOString();
    if (!report) {
      state.currentTarget = null;
      state.currentPlan = {
        type: 'scan-required',
        createdAt: state.lastDecisionAt,
        nextStage: 'scan',
        liveActionsEnabled: true
      };
      emit();
      return clone(state.currentPlan);
    }
    state.lastScannerSeq = report.scanSeq ?? null;
    state.lastReportGeneratedAt = report.generatedAt ?? null;
    updateTargetCatalog(report);
    const candidates = buildCandidates(report);
    const selected = candidates[0] || null;
    const previousEntityId = state.currentTarget?.entityId || null;
    state.currentTarget = selected ? clone(selected) : null;
    state.currentPlan = selected ? makePlan(selected) : {
      type: 'idle',
      createdAt: state.lastDecisionAt,
      nextStage: 'wait-for-eligible-target',
      liveActionsEnabled: true
    };
    if (selected?.entityId && selected.entityId !== previousEntityId) {
      pushLog('target', `Selected ${selected.name}.`, {
        source: selected.source,
        logicalKey: selected.logicalKey,
        runtimeId: selected.runtimeId,
        damageLimit: selected.damageLimit
      });
    } else {
      emit();
    }
    return clone(state.currentPlan);
  }
  async function reconcileScanner() {
    if (state.status !== ENGINE_STATES.RUNNING) return null;
    if (state.abortController?.signal?.aborted) return null;
    const scanner = window.AURELIX;
    if (!scanner?.scanNow) {
      state.lastError = 'AURELIX scanner is unavailable.';
      state.session.stats.errors += 1;
      pushLog('error', state.lastError);
      return null;
    }
    try {
      pushLog('scan', 'Refreshing world state.');
      const report = await scanner.scanNow();
      if (state.abortController?.signal?.aborted) return null;
      decideNow();
      return report;
    } catch (error) {
      if (state.abortController?.signal?.aborted) return null;
      state.lastError = String(error?.message || error);
      state.session.stats.errors += 1;
      pushLog('error', `Scanner refresh failed: ${state.lastError}`);
      return null;
    }
  }
  const sleep = (ms, signal = state.abortController?.signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    let settled = false;
    let timer = null;
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    timer = setTimeout(finish, Math.max(0, Number(ms) || 0));
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
  function runtimeEncounterKey(entity) {
    if (!entity) return 'unknown';
    if (entity.source === 'dungeon') {
      return `dungeon:${Number(entity.instanceId) || 0}:${Number(entity.dgmid ?? entity.runtimeId) || 0}`;
    }
    return `gate:${Number(entity.monsterId ?? entity.runtimeId) || 0}`;
  }
  function sameRuntimeTarget(a, b) {
    return !!a && !!b && runtimeEncounterKey(a) === runtimeEncounterKey(b);
  }
  function recordEncounterDamage(target, damage) {
    const key = runtimeEncounterKey(target);
    const value = Math.max(0, Number(damage) || 0);
    const previous = Number(state.encounterLedger[key]?.damage) || 0;
    state.encounterLedger[key] = {
      damage: Math.max(previous, value),
      logicalKey: target.logicalKey || null,
      updatedAt: new Date().toISOString()
    };
    if (state.currentTarget && sameRuntimeTarget(state.currentTarget, target)) {
      const confirmed = state.encounterLedger[key].damage;
      state.currentTarget.currentUserDamage = confirmed;
      state.currentTarget.userDamage = confirmed;
      state.currentTarget.damageLimit = Number(target.damageLimit) || state.currentTarget.damageLimit;
      state.currentTarget.phaseStage = target.phaseStage || state.currentTarget.phaseStage;
      state.currentTarget.phase3Baseline = Number.isFinite(Number(target.phase3Baseline)) ? Number(target.phase3Baseline) : state.currentTarget.phase3Baseline;
      state.currentTarget.phase3DamageLimit = Number(target.phase3DamageLimit) || state.currentTarget.phase3DamageLimit;
      state.currentTarget.remainingDamage = Math.max(0, Number(state.currentTarget.damageLimit || 0) - confirmed);
    }
    return state.encounterLedger[key].damage;
  }
  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const part = String(document.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(prefix));
    if (!part) return '';
    const value = part.slice(prefix.length);
    try { return decodeURIComponent(value); } catch (_) { return value; }
  }
  function parseNumber(value) {
    const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }
  async function fetchText(url, options = {}) {
    const resolvedUrl = new URL(url, location.origin);
    if (resolvedUrl.origin !== location.origin) throw new Error(`Refusing cross-origin combat request: ${resolvedUrl.origin}`);
    const externalSignal = options.signal || null;
    const controller = new AbortController();
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 15_000);
    try {
      const { signal: _ignoredSignal, ...requestOptions } = options;
      const res = await fetch(resolvedUrl.href, {
        credentials: 'include',
        cache: options.method && String(options.method).toUpperCase() !== 'GET' ? 'default' : 'no-store',
        ...requestOptions,
        signal: controller.signal
      });
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
  }
  const LOADOUT_LEGACY = Object.freeze({
    equipment: 'veyra_equipment_crystal_quicksets_v1',
    pets: 'cosmic_quick_pet_presets_v1'
  });
  const LOADOUT_SLOTS = Object.freeze({ weapon:1, helmet:2, armor:3, boots:4, gloves:5, ring1:6, amulet:7, ring2:9, classWeapon:10 });
  const LOADOUT_SLOT_BY_ID = Object.freeze(Object.fromEntries(Object.entries(LOADOUT_SLOTS).map(([key, value]) => [String(value), key])));
  const LOADOUT_VERIFY_TTL_MS = 10 * 60_000;
  const loadoutSignal = () => [ENGINE_STATES.RUNNING, ENGINE_STATES.STARTING].includes(state.status) ? state.abortController?.signal : null;
  const loadoutSleep = ms => sleep(ms, loadoutSignal());
  function normalizeAssetPath(src) {
    if (!src) return '';
    try { return new URL(src, location.href).pathname.replace(/^\//, ''); }
    catch (_) { return String(src).replace(/^\//, ''); }
  }
  function readLegacyJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? clone(fallback) : value;
    } catch (_) { return clone(fallback); }
  }
  function normalizeEquipmentPreset(preset) {
    if (!preset || !preset.id || !preset.equipment || preset.targetSet !== 'attack') return null;
    return { ...clone(preset), id:String(preset.id), name:normalizeSpace(preset.name) || 'Equipment Preset', targetSet:'attack' };
  }
  function normalizePetPreset(preset) {
    if (!preset || !preset.id || !preset.slots || preset.team !== 'attack') return null;
    return { ...clone(preset), id:String(preset.id), name:normalizeSpace(preset.name) || 'Pet Preset', team:'attack' };
  }
  function mergePresetLists(current, incoming, normalizer) {
    const byId = new Map();
    for (const raw of Array.isArray(current) ? current : []) {
      const item = normalizer(raw);
      if (item) byId.set(item.id, item);
    }
    let changed = false;
    for (const raw of Array.isArray(incoming) ? incoming : []) {
      const item = normalizer(raw);
      if (!item) continue;
      const before = byId.get(item.id);
      if (!before || Number(item.updatedAt || item.importedAt || 0) >= Number(before.updatedAt || before.importedAt || 0)) {
        if (JSON.stringify(before) !== JSON.stringify(item)) changed = true;
        byId.set(item.id, item);
      }
    }
    return { list:[...byId.values()], changed };
  }
  function syncLegacyPresets({ log = false, force = false } = {}) {
    if (!force && persistentGet(ENGINE_STORE.legacyPresetImport, '') === '1') return getLoadoutState();
    const legacyEquipment = readLegacyJson(LOADOUT_LEGACY.equipment, { presets:[] });
    const legacyPets = readLegacyJson(LOADOUT_LEGACY.pets, []);
    const equipment = mergePresetLists(state.equipmentPresets, legacyEquipment?.presets, normalizeEquipmentPreset);
    const pets = mergePresetLists(state.petPresets, legacyPets, normalizePetPreset);
    state.equipmentPresets = equipment.list;
    state.petPresets = pets.list;
    if (equipment.changed) saveObject(ENGINE_STORE.equipmentPresets, state.equipmentPresets);
    if (pets.changed) saveObject(ENGINE_STORE.petPresets, state.petPresets);
    persistentSet(ENGINE_STORE.legacyPresetImport, '1');
    if (log) pushLog('system', `Preset library synchronized: ${state.equipmentPresets.length} equipment, ${state.petPresets.length} pet.`);
    emit();
    return getLoadoutState();
  }
  function equipmentPresetById(id) { return state.equipmentPresets.find(p => String(p.id) === String(id || '')) || null; }
  function petPresetById(id) { return state.petPresets.find(p => String(p.id) === String(id || '')) || null; }
  function normalizeLoadoutAssignment(value) {
    return {
      equipmentPresetId: value?.equipmentPresetId ? String(value.equipmentPresetId) : '',
      petPresetId: value?.petPresetId ? String(value.petPresetId) : ''
    };
  }
  function loadoutGroupKey(value) {
    const assignment = normalizeLoadoutAssignment(value);
    return `equipment:${assignment.equipmentPresetId || 'current'}|pets:${assignment.petPresetId || 'current'}`;
  }
  const LOADOUT_FAILURE_RETRY_MS = 60_000;
  function loadoutGroupBlocked(groupKey) {
    if (!state.failedLoadoutGroups.has(groupKey)) return false;
    const failedAt = Number(state.failedLoadoutAt.get(groupKey)) || 0;
    if (failedAt > 0 && Date.now() - failedAt < LOADOUT_FAILURE_RETRY_MS) return true;
    state.failedLoadoutGroups.delete(groupKey);
    state.failedLoadoutAt.delete(groupKey);
    return false;
  }
  function activeLoadoutMatches(value) {
    const assignment = normalizeLoadoutAssignment(value);
    if (assignment.equipmentPresetId && assignment.equipmentPresetId !== state.activeLoadout.equipmentPresetId) return false;
    if (assignment.petPresetId && assignment.petPresetId !== state.activeLoadout.petPresetId) return false;
    return true;
  }
  function mirrorDungeonLoadoutAssignment(key, assignment) {
    const item = state.targetCatalog[key];
    if (!item || item.source !== 'dungeon' || !item.dungeonName || !item.locationName) return;
    const slotKey = dungeonBossSlotKey(item.dungeonName, item.locationName);
    const slot = state.targetCatalog[slotKey];
    if (!(item.catalogType === 'dungeon-boss-slot' || slot || item.supersededBy === slotKey)) return;
    state.loadoutAssignments[slotKey] = { ...assignment };
    for (const candidate of Object.values(state.targetCatalog)) {
      if (!candidate || candidate.source !== 'dungeon' || candidate.catalogType !== 'dungeon-mob') continue;
      if (normalizeName(candidate.dungeonName) !== normalizeName(item.dungeonName)) continue;
      if (normalizeName(candidate.locationName) !== normalizeName(item.locationName)) continue;
      if (slot?.supersededBy && candidate.key !== slot.supersededBy && candidate.key !== key) continue;
      if (candidate.key) state.loadoutAssignments[candidate.key] = { ...assignment };
    }
  }
  function setTargetLoadoutAssignment(key, patch) {
    if (!key || typeof key !== 'string') return false;
    const next = normalizeLoadoutAssignment({ ...(state.loadoutAssignments[key] || {}), ...(patch || {}) });
    state.loadoutAssignments[key] = { ...next, updatedAt:new Date().toISOString() };
    const stableKey = stableAssignmentKey(state.targetCatalog[key]);
    if (stableKey) state.loadoutAssignments[stableKey] = { ...next, updatedAt:new Date().toISOString() };
    mirrorDungeonLoadoutAssignment(key, state.loadoutAssignments[key]);
    state.failedLoadoutGroups.delete(loadoutGroupKey(next));
    state.failedLoadoutAt.delete(loadoutGroupKey(next));
    const saved = saveObject(ENGINE_STORE.loadoutAssignments, state.loadoutAssignments);
    if (!saved) pushLog('error', `Loadout assignment persistence failed for ${key}.`);
    decideNow();
    emit();
    return saved !== false;
  }
  async function loadoutRequest(url, { method='GET', params=null, expect='auto' } = {}) {
    let target = url;
    const options = { method, signal:loadoutSignal() };
    if (String(method).toUpperCase() === 'GET' && params) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => { if (v != null) query.set(k, String(v)); });
      target += (target.includes('?') ? '&' : '?') + query.toString();
    } else if (params) {
      const body = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => { if (v != null) body.set(k, String(v)); });
      options.headers = { 'Content-Type':'application/x-www-form-urlencoded' };
      options.body = body.toString();
    }
    const { res, text } = await fetchText(target, options);
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}: ${text.slice(0,160)}`);
    if (expect === 'text') return text;
    if (expect === 'json') {
      try { return JSON.parse(text); } catch (_) { throw new Error(`Invalid JSON from ${url}`); }
    }
    try { return JSON.parse(text); } catch (_) { return text; }
  }
  function parseEquippedEquipment(doc) {
    const result = {};
    [...doc.querySelectorAll('.slot-box')].forEach(box => {
      const button = box.querySelector('button[onclick*="unequipItem"]');
      const match = (button?.getAttribute('onclick') || '').match(/unequipItem\(\s*(\d+)\s*\)/i);
      const slot = match ? LOADOUT_SLOT_BY_ID[String(match[1])] : null;
      const image = box.querySelector('.item-container img, img');
      if (!slot || !image) return;
      result[slot] = {
        slot, slotId:Number(match[1]),
        name:box.querySelector('.info-btn')?.dataset?.name || image.alt || slot,
        image:normalizeAssetPath(image.getAttribute('src')),
        crystals:[]
      };
    });
    return result;
  }
  function parseUnequippedEquipment(doc) {
    const byImage = new Map(), byName = new Map();
    [...doc.querySelectorAll('button[onclick*="showEquipModal"]')].forEach(button => {
      const match = (button.getAttribute('onclick') || '').match(/showEquipModal\(\s*(\d+)\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]?(\d+)['"]?\s*\)/i);
      if (!match) return;
      const card = button.closest('.equipment-item, .item-card, .equipment-card, .inventory-item, .legendary, .epic, .rare') || button.parentElement?.parentElement;
      const image = card?.querySelector('img');
      const rec = { itemId:match[1], type:match[2], invId:match[3], name:card?.querySelector('.equipment-item-name')?.textContent?.trim() || image?.alt || '', image:normalizeAssetPath(image?.getAttribute('src')) };
      if (rec.image) byImage.set(rec.image, rec);
      if (rec.name) byName.set(rec.name.toLowerCase(), rec);
    });
    return { byImage, byName };
  }
  function parseCrystalEquipment(doc) {
    return [...doc.querySelectorAll('.equipment-card')].map(card => {
      const image = normalizeAssetPath(card.querySelector('img')?.getAttribute('src'));
      const crystals = [...card.querySelectorAll('[onclick*="openConfirmUnequip"]')].map(button => ({
        id:(button.getAttribute('onclick') || '').match(/openConfirmUnequip\((\d+)\)/)?.[1] || null,
        image:normalizeAssetPath(button.querySelector('img')?.getAttribute('src'))
      })).filter(x => x.id);
      const equipmentInvId = (card.querySelector('[onclick*="openPickerModal"]')?.getAttribute('onclick') || '').match(/openPickerModal\((\d+)\)/)?.[1] || null;
      return { image, equipmentInvId, crystals };
    });
  }
  async function fetchEquipmentSnapshot() {
    const [attackHtml, crystalHtml] = await Promise.all([
      loadoutRequest('/inventory.php', { params:{ set:'attack' }, expect:'text' }),
      loadoutRequest('/power_crystals.php', { expect:'text' })
    ]);
    const equipped = parseEquippedEquipment(docFromHtml(attackHtml));
    const cards = parseCrystalEquipment(docFromHtml(crystalHtml));
    const crystalByInvId = new Map(cards.filter(x => x.equipmentInvId).map(x => [String(x.equipmentInvId), x]));
    const crystalByImage = new Map();
    for (const card of cards.filter(x => x.image)) {
      if (!crystalByImage.has(card.image)) crystalByImage.set(card.image, []);
      crystalByImage.get(card.image).push(card);
    }
    for (const item of Object.values(equipped)) {
      const crystalCandidates = crystalByImage.get(normalizeAssetPath(item.image)) || [];
      const card = crystalCandidates.length === 1 ? crystalCandidates[0] : null;
      if (card?.equipmentInvId) item.invId = String(card.equipmentInvId);
      item.crystals = card?.crystals || [];
    }
    Object.defineProperty(equipped, '_crystalCards', { value:cards, enumerable:false });
    return equipped;
  }
  const crystalIds = list => (list || []).map(x => String(x?.id ?? x)).sort().join(',');
  function equipmentItemMatches(desired, live) {
    if (!desired || !live) return false;
    const desiredId = String(desired.invId || '');
    const liveId = String(live.invId || '');
    return desiredId && liveId
      ? desiredId === liveId
      : normalizeAssetPath(desired.image) === normalizeAssetPath(live.image);
  }
  function equipmentPresetMatches(preset, current) {
    const desired = preset?.equipment || {}, a = Object.keys(desired), b = Object.keys(current || {});
    return a.length === b.length && a.every(slot => {
      const live = current[slot];
      if (!live) return false;
      return equipmentItemMatches(desired[slot], live) && crystalIds(desired[slot].crystals) === crystalIds(live.crystals);
    });
  }
  async function captureEquipmentPreset(name, { persist = true } = {}) {
    const [attackHtml, pvpHtml, defenseHtml, crystalHtml] = await Promise.all([
      loadoutRequest('/inventory.php', { params:{ set:'attack' }, expect:'text' }),
      loadoutRequest('/inventory.php', { params:{ set:'pvp_attack' }, expect:'text' }).catch(() => ''),
      loadoutRequest('/inventory.php', { params:{ set:'defense' }, expect:'text' }).catch(() => ''),
      loadoutRequest('/power_crystals.php', { expect:'text' })
    ]);
    const inventoryDocs = {
      attack:docFromHtml(attackHtml),
      pvp_attack:docFromHtml(pvpHtml),
      defense:docFromHtml(defenseHtml)
    };
    const equipped = parseEquippedEquipment(inventoryDocs.attack);
    if (!Object.keys(equipped).length) throw new Error('No PvE equipment detected.');
    const byImage = new Map(), byName = new Map();
    for (const doc of Object.values(inventoryDocs)) {
      const parsed = parseUnequippedEquipment(doc);
      for (const [key,value] of parsed.byImage) if (!byImage.has(key)) byImage.set(key,value);
      for (const [key,value] of parsed.byName) if (!byName.has(key)) byName.set(key,value);
    }
    const crystalCards = parseCrystalEquipment(docFromHtml(crystalHtml));
    const crystalByImage = new Map(crystalCards.filter(x => x.image).map(x => [x.image,x]));
    const crystalByInvId = new Map(crystalCards.filter(x => x.equipmentInvId).map(x => [String(x.equipmentInvId),x]));
    for (const item of Object.values(equipped)) {
      const inventory = byImage.get(item.image) || byName.get(String(item.name).toLowerCase());
      if (inventory) item.invId = inventory.invId;
      const card = (item.invId && crystalByInvId.get(String(item.invId))) || crystalByImage.get(item.image);
      item.crystals = card?.crystals || [];
      if (!item.invId && card?.equipmentInvId) item.invId = card.equipmentInvId;
    }
    const missing = Object.values(equipped).filter(x => !x.invId);
    if (missing.length) throw new Error(`Could not resolve inventory ID for: ${missing.map(x => x.name).join(', ')}`);
    const now = Date.now();
    const preset = { id:`axeq_${now.toString(36)}${Math.random().toString(36).slice(2,7)}`, name:normalizeSpace(name) || `Equipment ${state.equipmentPresets.length + 1}`, targetSet:'attack', equipment:equipped, importedAt:now, updatedAt:now };
    if (persist) {
      state.equipmentPresets.push(preset);
      saveObject(ENGINE_STORE.equipmentPresets, state.equipmentPresets);
      emit();
    }
    return clone(preset);
  }
  async function equipmentPost(data) { return loadoutRequest('/inventory_ajax.php', { method:'POST', params:data, expect:'text' }); }
  async function applyEquipmentPreset(preset) {
    if (!normalizeEquipmentPreset(preset)) throw new Error('Invalid PvE equipment preset.');
    const current = await fetchEquipmentSnapshot();
    if (equipmentPresetMatches(preset, current)) return 0;
    const desired = preset.equipment || {};
    const cards = current._crystalCards || [];
    const currentCrystalLocation = new Map();
    for (const card of cards) for (const crystal of card.crystals) currentCrystalLocation.set(String(crystal.id), { invId:card.equipmentInvId ? String(card.equipmentInvId) : null, image:card.image });
    let changed = 0;
    for (const item of Object.values(desired)) for (const crystal of item.crystals || []) {
      const location = currentCrystalLocation.get(String(crystal.id));
      const correct = location && ((location.invId && location.invId === String(item.invId)) || (!location.invId && location.image === normalizeAssetPath(item.image)));
      if (!location || correct) continue;
      await loadoutRequest('/power_crystals.php', { method:'POST', params:{ action:'unequip_crystal', crystal_id:crystal.id }, expect:'text' });
      currentCrystalLocation.delete(String(crystal.id)); changed++; await loadoutSleep(40);
    }
    for (const slot of Object.keys(LOADOUT_SLOTS)) {
      const wanted = desired[slot];
      if (!wanted || equipmentItemMatches(wanted, current[slot])) continue;
      if (current[slot]) {
        const result = await equipmentPost({ action:'unequip_item', slot_id:LOADOUT_SLOTS[slot], set:'attack' });
        if (String(result).trim() !== 'OK') throw new Error(`Unequip ${slot}: ${String(result).trim()}`);
        changed++; await loadoutSleep(40);
      }
      const result = await equipmentPost({ action:'equip_item', inv_id:wanted.invId, slot_id:(slot === 'ring1' || slot === 'ring2') ? LOADOUT_SLOTS[slot] : 0, set:'attack' });
      if (String(result).trim() !== 'OK') throw new Error(`Equip ${wanted.name}: ${String(result).trim()}`);
      changed++; await loadoutSleep(40);
    }
    for (const item of Object.values(desired)) for (const crystal of item.crystals || []) {
      const location = currentCrystalLocation.get(String(crystal.id));
      const correct = location && ((location.invId && location.invId === String(item.invId)) || (!location.invId && location.image === normalizeAssetPath(item.image)));
      if (correct) continue;
      await loadoutRequest('/power_crystals.php', { method:'POST', params:{ action:'equip_crystal', crystal_id:crystal.id, equipment_inv_id:item.invId }, expect:'text' });
      changed++; await loadoutSleep(40);
    }
    if (!equipmentPresetMatches(preset, await fetchEquipmentSnapshot())) throw new Error('Equipment and crystal verification failed.');
    return changed;
  }
  function petRecordFromCard(id, name, image) {
    let absoluteImage = '';
    try { absoluteImage = image ? new URL(image, location.href).href : ''; }
    catch (_) { absoluteImage = String(image || ''); }
    return { id:id == null ? null : String(id), name:name || `Pet ${id}`, image:absoluteImage };
  }
  let petCatalogueCache = null;
  let petCatalogueCachedAt = 0;
  async function getPetCatalogue(force = false) {
    if (!force && Array.isArray(petCatalogueCache) && petCatalogueCache.length && Date.now() - petCatalogueCachedAt < 120_000) return clone(petCatalogueCache);
    const html = await loadoutRequest('/pets.php', { params:{ team:'attack' }, expect:'text' });
    const doc = docFromHtml(html), map = new Map();
    for (const card of doc.querySelectorAll('.slot-box.pet-card')) {
      let id = card.dataset.petInvId || card.getAttribute('data-pet-inv-id');
      if (!id) id = card.outerHTML.match(/(?:showEquipModal|openLinksModal)\s*\(\s*(\d+)/)?.[1];
      if (!id) continue;
      const image = card.querySelector('img');
      const record = petRecordFromCard(id, image?.alt?.trim() || card.querySelector('[data-pet-name]')?.textContent?.trim(), image?.getAttribute('src') || image?.getAttribute('data-src'));
      const previous = map.get(String(id));
      if (!previous || (!previous.image && record.image)) map.set(String(id), record);
    }
    petCatalogueCache = [...map.values()].sort((a,b) => a.name.localeCompare(b.name));
    petCatalogueCachedAt = Date.now();
    if (!petCatalogueCache.length) throw new Error('Could not load your pet inventory.');
    return clone(petCatalogueCache);
  }
  async function getPetLinkCandidates(mainId) {
    if (!mainId) throw new Error('Choose a main pet first.');
    const [catalogue, data] = await Promise.all([getPetCatalogue(), fetchPetLinkState(mainId)]);
    const known = new Map(catalogue.map(p => [String(p.id), p]));
    return (data.candidates || []).map(candidate => {
      const pet = known.get(String(candidate.inv_id));
      return petRecordFromCard(candidate.inv_id, candidate.name || pet?.name, candidate.img || pet?.image);
    }).sort((a,b) => a.name.localeCompare(b.name));
  }
  function emptyPetFormationSlot() { return { main:null, links:{ 1:null, 2:null } }; }
  function normalizePetFormation(input) {
    const now = Date.now();
    const out = {
      id:input?.id ? String(input.id) : `axpet_${now.toString(36)}${Math.random().toString(36).slice(2,7)}`,
      name:normalizeSpace(input?.name) || `Pet Preset ${state.petPresets.length + 1}`,
      team:'attack', createdAt:Number(input?.createdAt) || now, updatedAt:now,
      slots:{ 1:emptyPetFormationSlot(), 2:emptyPetFormationSlot(), 3:emptyPetFormationSlot() }
    };
    for (let slot=1; slot<=3; slot++) {
      const source = input?.slots?.[slot] || input?.slots?.[String(slot)] || {};
      if (source.main?.id) out.slots[slot].main = petRecordFromCard(source.main.id, source.main.name, source.main.image);
      for (let level=1; level<=2; level++) {
        const linked = source.links?.[level] || source.links?.[String(level)];
        if (linked?.id) out.slots[slot].links[level] = petRecordFromCard(linked.id, linked.name, linked.image);
      }
    }
    return out;
  }
  function validatePetFormation(preset) {
    const used = new Set();
    for (let slot=1; slot<=3; slot++) {
      const cfg = preset?.slots?.[slot] || preset?.slots?.[String(slot)];
      if (!cfg?.main?.id) throw new Error(`Main Pet Slot ${slot} is empty.`);
      const mainId = String(cfg.main.id);
      if (used.has(mainId)) throw new Error(`${cfg.main.name || `Pet ${mainId}`} is used more than once.`);
      used.add(mainId);
      for (let level=1; level<=2; level++) {
        const linked = cfg.links?.[level] || cfg.links?.[String(level)];
        if (!linked?.id) continue;
        const linkedId = String(linked.id);
        if (used.has(linkedId)) throw new Error(`${linked.name || `Pet ${linkedId}`} is used more than once.`);
        used.add(linkedId);
      }
    }
    return true;
  }
  function savePetPresetDefinition(input) {
    const preset = normalizePetFormation(input);
    validatePetFormation(preset);
    const index = state.petPresets.findIndex(x => String(x.id) === String(preset.id));
    if (index >= 0) state.petPresets[index] = preset;
    else state.petPresets.push(preset);
    saveObject(ENGINE_STORE.petPresets, state.petPresets);
    if (String(state.activeLoadout.petPresetId || '') === String(preset.id)) {
      state.activeLoadout.petPresetId = null;
      state.activeLoadout.detected = false;
    }
    state.failedLoadoutGroups.clear();
    state.failedLoadoutAt.clear();
    emit();
    return clone(preset);
  }
  function duplicatePetPreset(id) {
    const source = petPresetById(id);
    if (!source) throw new Error('Pet preset no longer exists.');
    const copy = normalizePetFormation({ ...clone(source), id:null, name:`${source.name} (Copy)`, createdAt:null });
    validatePetFormation(copy);
    state.petPresets.push(copy);
    saveObject(ENGINE_STORE.petPresets, state.petPresets);
    emit();
    return clone(copy);
  }
  async function fetchPetLinkState(id) {
    const data = await loadoutRequest('/pet_links_ajax.php', { params:{ pet_inv_id:id }, expect:'json' });
    if (data?.status !== 'success') throw new Error(data?.message || `Could not read links for pet ${id}.`);
    return data;
  }
  async function fetchPetSnapshot() {
    const html = await loadoutRequest('/pets.php', { params:{ team:'attack' }, expect:'text' });
    const doc = docFromHtml(html), result = {}, equipped = [];
    for (const card of doc.querySelectorAll('.slot-box.pet-card')) {
      const button = [...card.querySelectorAll('button')].find(x => normalizeName(x.textContent) === 'unequip');
      const slot = Number((button?.getAttribute('onclick') || '').match(/unequipPet\s*\(\s*(\d+)/)?.[1]);
      const id = card.dataset.petInvId || card.getAttribute('data-pet-inv-id');
      if (!id || slot < 1 || slot > 3) continue;
      const image = card.querySelector('img');
      const pet = petRecordFromCard(id, image?.alt?.trim(), image?.getAttribute('src'));
      equipped.push({ slot, pet });
    }
    const linkStates = await Promise.all(equipped.map(x => fetchPetLinkState(x.pet.id)));
    equipped.forEach(({ slot, pet }, index) => {
      pet.links = {};
      for (const link of linkStates[index]?.links || []) {
        const level = Number(link.link_level), linkedId = link.inv_id ?? link.link_pet_id;
        if ((level === 1 || level === 2) && linkedId) pet.links[level] = String(linkedId);
      }
      Object.defineProperty(pet, '_linkState', { value:linkStates[index], enumerable:false });
      result[slot] = pet;
    });
    return result;
  }
  function petPresetMatches(preset, current) {
    for (let slot=1; slot<=3; slot++) {
      const desired = preset?.slots?.[slot] || preset?.slots?.[String(slot)];
      const live = current?.[slot];
      if (String(desired?.main?.id || '') !== String(live?.id || '')) return false;
      for (let level=1; level<=2; level++) if (String(desired?.links?.[level]?.id || desired?.links?.[String(level)]?.id || '') !== String(live?.links?.[level] || '')) return false;
    }
    return true;
  }
  async function capturePetPreset(name, { persist = true } = {}) {
    const current = await fetchPetSnapshot(), now = Date.now();
    if (Object.keys(current).length !== 3) throw new Error('All three PvE main-pet slots must be equipped before saving.');
    const slots = {};
    for (let slot=1; slot<=3; slot++) {
      const main = current[slot];
      slots[slot] = { main:{ id:main.id, name:main.name, image:main.image }, links:{ 1:null, 2:null } };
      const data = main._linkState || { links:[] };
      for (const link of data.links || []) {
        const level = Number(link.link_level), id = link.inv_id ?? link.link_pet_id;
        if ((level === 1 || level === 2) && id) slots[slot].links[level] = petRecordFromCard(id, link.name, link.img);
      }
    }
    const preset = { id:`axpet_${now.toString(36)}${Math.random().toString(36).slice(2,7)}`, name:normalizeSpace(name) || `Pet Preset ${state.petPresets.length + 1}`, team:'attack', slots, createdAt:now, updatedAt:now };
    if (persist) {
      state.petPresets.push(preset);
      saveObject(ENGINE_STORE.petPresets, state.petPresets);
      emit();
    }
    return clone(preset);
  }
  async function petUnlink(mainId, level) {
    const data = await fetchPetLinkState(mainId), existing = (data.links || []).find(x => Number(x.link_level) === Number(level));
    if (!existing) return false;
    if (!data.csrf) throw new Error('Game did not provide the pet-link security token.');
    const result = await loadoutRequest('/pet_link_action.php', { method:'POST', params:{ action:'remove', csrf:data.csrf, pet_inv_id:mainId, link_level:level }, expect:'json' });
    if (result?.status !== 'success') throw new Error(result?.message || 'Pet unlink failed.');
    return true;
  }
  async function petUnlinkKnown(mainId, level, data) {
    const existing = (data?.links || []).find(x => Number(x.link_level) === Number(level));
    if (!existing) return false;
    if (!data?.csrf) throw new Error('Game did not provide the pet-link security token.');
    const result = await loadoutRequest('/pet_link_action.php', { method:'POST', params:{ action:'remove', csrf:data.csrf, pet_inv_id:mainId, link_level:level }, expect:'json' });
    if (result?.status !== 'success') return await petUnlink(mainId, level);
    data.links = (data.links || []).filter(x => Number(x.link_level) !== Number(level));
    return true;
  }
  async function petLink(mainId, level, linkedId) {
    const data = await fetchPetLinkState(mainId);
    const existing = (data.links || []).find(x => Number(x.link_level) === Number(level));
    if (String(existing?.inv_id ?? existing?.link_pet_id ?? '') === String(linkedId)) return false;
    if (!data.csrf) throw new Error('Game did not provide the pet-link security token.');
    if (!(data.candidates || []).some(x => String(x.inv_id) === String(linkedId))) throw new Error(`Pet ${linkedId} is not eligible for Link ${level}.`);
    const result = await loadoutRequest('/pet_link_action.php', { method:'POST', params:{ action:'set', csrf:data.csrf, pet_inv_id:mainId, link_level:level, link_pet_id:linkedId }, expect:'json' });
    if (result?.status !== 'success') throw new Error(result?.message || 'Pet link failed.');
    return true;
  }
  async function petLinkKnown(mainId, level, linkedId, data) {
    const existing = (data?.links || []).find(x => Number(x.link_level) === Number(level));
    if (String(existing?.inv_id ?? existing?.link_pet_id ?? '') === String(linkedId)) return false;
    if (!data?.csrf) throw new Error('Game did not provide the pet-link security token.');
    if (!(data.candidates || []).some(x => String(x.inv_id) === String(linkedId))) throw new Error(`Pet ${linkedId} is not eligible for Link ${level}.`);
    const result = await loadoutRequest('/pet_link_action.php', { method:'POST', params:{ action:'set', csrf:data.csrf, pet_inv_id:mainId, link_level:level, link_pet_id:linkedId }, expect:'json' });
    if (result?.status !== 'success') return await petLink(mainId, level, linkedId);
    data.links = (data.links || []).filter(x => Number(x.link_level) !== Number(level));
    data.links.push({ link_level:level, inv_id:String(linkedId) });
    return true;
  }
  async function applyPetPreset(preset) {
    if (!normalizePetPreset(preset)) throw new Error('Invalid PvE pet preset.');
    validatePetFormation(preset);
    const current = await fetchPetSnapshot();
    if (petPresetMatches(preset, current)) return 0;
    const desiredMainIds = new Set(), desiredLinkUsage = new Map();
    for (let slot=1; slot<=3; slot++) {
      const cfg = preset.slots[slot] || preset.slots[String(slot)];
      if (!cfg?.main?.id) throw new Error(`Pet preset slot ${slot} is empty.`);
      desiredMainIds.add(String(cfg.main.id));
      for (let level=1; level<=2; level++) if (cfg.links?.[level]?.id) desiredLinkUsage.set(String(cfg.links[level].id), String(cfg.main.id));
    }
    let changed = 0;
    const relevant = new Set([...Object.values(current).map(x => String(x.id)), ...desiredMainIds]);
    const currentStates = new Map(Object.values(current).filter(x => x?._linkState).map(x => [String(x.id), x._linkState]));
    const relevantIds = [...relevant];
    const missingStateIds = relevantIds.filter(id => !currentStates.has(id));
    const missingStates = await Promise.all(missingStateIds.map(fetchPetLinkState));
    missingStateIds.forEach((id, index) => currentStates.set(id, missingStates[index]));
    for (let relevantIndex = 0; relevantIndex < relevantIds.length; relevantIndex++) {
      const mainId = relevantIds[relevantIndex];
      const data = currentStates.get(mainId);
      let desiredCfg = null;
      for (let slot=1; slot<=3; slot++) {
        const cfg = preset.slots[slot] || preset.slots[String(slot)];
        if (String(cfg?.main?.id) === mainId) desiredCfg = cfg;
      }
      for (let level=1; level<=2; level++) {
        const existing = (data.links || []).find(x => Number(x.link_level) === level);
        const existingId = existing?.inv_id ?? existing?.link_pet_id;
        if (!existingId) continue;
        const desiredId = desiredCfg?.links?.[level]?.id || '';
        const mustRemove = desiredCfg ? String(existingId) !== String(desiredId) : (desiredLinkUsage.has(String(existingId)) && desiredLinkUsage.get(String(existingId)) !== mainId);
        if (mustRemove && await petUnlinkKnown(mainId, level, data)) { changed++; await loadoutSleep(25); }
      }
    }
    const changedMainIds = new Set();
    for (let slot=1; slot<=3; slot++) {
      const desired = (preset.slots[slot] || preset.slots[String(slot)]).main;
      if (String(current[slot]?.id || '') === String(desired.id)) continue;
      const result = await loadoutRequest('/inventory_ajax.php', { method:'POST', params:{ action:'equip_pet', team:'attack', pet_inv_id:desired.id, slot_id:slot }, expect:'text' });
      if (String(result).trim() !== 'OK') throw new Error(String(result).trim() || `Could not equip ${desired.name}.`);
      changedMainIds.add(String(desired.id));
      changed++; await loadoutSleep(25);
    }
    const desiredStateIds = [...desiredMainIds];
    const refreshStateIds = desiredStateIds.filter(id => changedMainIds.has(id) || !currentStates.has(id));
    const refreshedStates = await Promise.all(refreshStateIds.map(fetchPetLinkState));
    const desiredStateById = new Map(desiredStateIds.map(id => [id, currentStates.get(id)]));
    refreshStateIds.forEach((id, index) => desiredStateById.set(id, refreshedStates[index]));
    for (let slot=1; slot<=3; slot++) {
      const cfg = preset.slots[slot] || preset.slots[String(slot)];
      const data = desiredStateById.get(String(cfg.main.id));
      for (let level=1; level<=2; level++) if (cfg.links?.[level]?.id && await petLinkKnown(cfg.main.id, level, cfg.links[level].id, data)) { changed++; await loadoutSleep(25); }
    }
    if (!petPresetMatches(preset, await fetchPetSnapshot())) throw new Error('Pet preset verification failed.');
    return changed;
  }
  function resetAllDamageCalibration(reason) {
    state.slashModels.clear();
    state.skillDamageModels.clear();
    invalidateCombatPreflight();
    pushLog('scan', `All damage calibration reset (${reason}).`);
  }
  async function applyLoadoutAssignment(assignment, { manual=false } = {}) {
    const normalized = normalizeLoadoutAssignment(assignment), groupKey = loadoutGroupKey(normalized);
    if (manual && state.status === ENGINE_STATES.RUNNING) throw new Error('Stop AURELIX before manually equipping a preset.');
    if (state.loadoutPromise) return state.loadoutPromise;
    state.loadoutPromise = (async () => {
      state.loadoutInFlight = true; emit();
      const loadoutStartedAt = performance.now();
      let changed = 0;
      try {
        const equipment = normalized.equipmentPresetId ? equipmentPresetById(normalized.equipmentPresetId) : null;
        const pets = normalized.petPresetId ? petPresetById(normalized.petPresetId) : null;
        if (normalized.equipmentPresetId && !equipment) throw new Error(`Equipment preset ${normalized.equipmentPresetId} is missing.`);
        if (normalized.petPresetId && !pets) throw new Error(`Pet preset ${normalized.petPresetId} is missing.`);
        if (equipment || pets) {
          state.activeLoadout.detected = false;
          state.activeLoadout.checkedAt = 0;
        }
        if (equipment) { pushLog('system', `Checking equipment preset “${equipment.name}”…`); changed += await applyEquipmentPreset(equipment); }
        if (pets) { pushLog('system', `Checking pet preset “${pets.name}”…`); changed += await applyPetPreset(pets); }
        if (normalized.equipmentPresetId) state.activeLoadout.equipmentPresetId = normalized.equipmentPresetId;
        if (normalized.petPresetId) state.activeLoadout.petPresetId = normalized.petPresetId;
        state.activeLoadout.detected = true; state.activeLoadout.checkedAt = Date.now();
        state.failedLoadoutGroups.delete(groupKey);
        state.failedLoadoutAt.delete(groupKey);
        if (changed > 0) resetAllDamageCalibration('verified loadout change');
        const elapsedSeconds = Math.max(0, (performance.now() - loadoutStartedAt) / 1000).toFixed(2);
        pushLog('success', changed > 0
          ? `Loadout ready in ${elapsedSeconds}s: ${changed} required change${changed === 1 ? '' : 's'} applied and verified.`
          : `Required loadout already equipped and verified in ${elapsedSeconds}s; no changes needed.`);
        return { ok:true, changed };
      } catch (error) {
        state.activeLoadout = { equipmentPresetId:null, petPresetId:null, detected:false, checkedAt:0 };
        throw error;
      } finally { state.loadoutInFlight = false; state.loadoutPromise = null; emit(); }
    })();
    return state.loadoutPromise;
  }
  async function ensureTargetLoadout(target) {
    const assignment = normalizeLoadoutAssignment(target?.loadoutAssignment || state.loadoutAssignments[target?.policyKey] || state.loadoutAssignments[target?.logicalKey]);
    const groupKey = loadoutGroupKey(assignment);
    if (loadoutGroupBlocked(groupKey)) return false;
    const requiresPreset = !!(assignment.equipmentPresetId || assignment.petPresetId);
    const detectionFresh = state.activeLoadout.detected && Date.now() - Number(state.activeLoadout.checkedAt || 0) < LOADOUT_VERIFY_TTL_MS;
    if (!requiresPreset) return true;
    if (target?.phaseWaiting && state.activeLoadout.detected && activeLoadoutMatches(assignment)) return true;
    if (detectionFresh && activeLoadoutMatches(assignment)) return true;
    try { await applyLoadoutAssignment(assignment); return true; }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      state.failedLoadoutGroups.add(groupKey);
      state.failedLoadoutAt.set(groupKey, Date.now());
      state.session.stats.errors += 1;
      pushLog('error', `Loadout group skipped for ${target?.name || 'target'}: ${error?.message || error}`);
      decideNow();
      return false;
    }
  }
  async function detectActiveLoadout() {
    if (state.loadoutInFlight) return clone(state.activeLoadout);
    const [equipment, pets] = await Promise.all([fetchEquipmentSnapshot(), fetchPetSnapshot()]);
    state.activeLoadout = {
      equipmentPresetId:state.equipmentPresets.find(p => equipmentPresetMatches(p, equipment))?.id || null,
      petPresetId:state.petPresets.find(p => petPresetMatches(p, pets))?.id || null,
      detected:true, checkedAt:Date.now()
    };
    emit();
    return clone(state.activeLoadout);
  }
  function renameLoadoutPreset(kind, id, name) {
    const list = kind === 'equipment' ? state.equipmentPresets : state.petPresets;
    const preset = list.find(x => String(x.id) === String(id));
    const clean = normalizeSpace(name);
    if (!preset || !clean) return false;
    preset.name = clean; preset.updatedAt = Date.now();
    saveObject(kind === 'equipment' ? ENGINE_STORE.equipmentPresets : ENGINE_STORE.petPresets, list);
    emit(); return true;
  }
  async function updateLoadoutPreset(kind, id) {
    const listKey = kind === 'equipment' ? 'equipmentPresets' : 'petPresets';
    const storeKey = kind === 'equipment' ? ENGINE_STORE.equipmentPresets : ENGINE_STORE.petPresets;
    const current = state[listKey].find(x => String(x.id) === String(id));
    if (!current) throw new Error('Preset no longer exists.');
    const fresh = kind === 'equipment'
      ? await captureEquipmentPreset(current.name, { persist:false })
      : await capturePetPreset(current.name, { persist:false });
    state[listKey] = state[listKey].filter(x => String(x.id) !== String(id));
    fresh.id = String(id); fresh.name = current.name; fresh.updatedAt = Date.now();
    state[listKey].push(fresh);
    saveObject(storeKey, state[listKey]);
    if (kind === 'equipment' && String(state.activeLoadout.equipmentPresetId || '') === String(id)) state.activeLoadout.equipmentPresetId = null;
    if (kind === 'pet' && String(state.activeLoadout.petPresetId || '') === String(id)) state.activeLoadout.petPresetId = null;
    state.activeLoadout.detected = false;
    state.failedLoadoutGroups.clear();
    state.failedLoadoutAt.clear();
    emit();
    return clone(fresh);
  }
  function deleteLoadoutPreset(kind, id) {
    const key = kind === 'equipment' ? 'equipmentPresets' : 'petPresets';
    const before = state[key].length;
    state[key] = state[key].filter(x => String(x.id) !== String(id));
    if (state[key].length === before) return false;
    saveObject(kind === 'equipment' ? ENGINE_STORE.equipmentPresets : ENGINE_STORE.petPresets, state[key]);
    if (kind === 'equipment' && String(state.activeLoadout.equipmentPresetId || '') === String(id)) state.activeLoadout.equipmentPresetId = null;
    if (kind === 'pet' && String(state.activeLoadout.petPresetId || '') === String(id)) state.activeLoadout.petPresetId = null;
    emit(); return true;
  }
  function getLoadoutState() {
    return {
      equipmentPresets:clone(state.equipmentPresets), petPresets:clone(state.petPresets),
      assignments:clone(state.loadoutAssignments), active:clone(state.activeLoadout),
      busy:state.loadoutInFlight, failedGroups:[...state.failedLoadoutGroups]
    };
  }
  syncLegacyPresets();
  function docFromHtml(html) {
    return new DOMParser().parseFromString(String(html || ''), 'text/html');
  }
  function battleUrlFor(target) {
    if (target?.battleUrl) return new URL(target.battleUrl, location.origin).href;
    if (target?.source === 'dungeon') {
      const u = new URL('/battle.php', location.origin);
      u.searchParams.set('dgmid', String(target.dgmid ?? target.runtimeId));
      u.searchParams.set('instance_id', String(target.instanceId));
      return u.href;
    }
    const u = new URL('/battle.php', location.origin);
    u.searchParams.set('id', String(target?.monsterId ?? target?.runtimeId));
    return u.href;
  }
  function activeSkillKey(skill) {
    if (!skill) return null;
    return ['skill', String(skill.skillId ?? skill.id ?? ''), normalizeName(skill.name)].join('|');
  }
  function isBuiltInSlashSkill(skill) {
    const id = Number(skill?.skillId ?? skill?.id);
    const name = normalizeName(skill?.name || '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return Number.isFinite(id) && id <= 0 || /^(?:slash|power slash|heroic slash|ultimate slash|legendary slash|world breaker slash)$/.test(name);
  }
  function cleanActiveSkillName(value) {
    return normalizeSpace(String(value || '')
      .replace(/\b[\d,]+\s*(?:MP|MANA|STAM|STAMINA)\b/gi, ' ')
      .replace(/\b(?:use|cast|activate)\b\s*$/i, ' ')
      .replace(/[|•]+\s*$/g, ' '));
  }
  function parseActiveSkillsFromBattle(doc) {
    if (!doc?.querySelectorAll) return [];
    const skills = [];
    const nodes = [...doc.querySelectorAll('.skill-slot[data-skill-id],.attack-btn[data-skill-id],[data-action="skill"][data-skill-id],button[data-skill-id],a[data-skill-id]')]
      .filter((el, index, all) => !all.some((other, otherIndex) => otherIndex < index && other.contains(el) && other.dataset?.skillId === el.dataset?.skillId));
    for (const el of nodes) {
      const skillId = String(el.dataset?.skillId ?? el.getAttribute('data-skill-id') ?? '').trim();
      const name = cleanActiveSkillName(el.dataset?.skillName || el.getAttribute('data-skill-name') || el.getAttribute('title') || el.getAttribute('aria-label') || el.querySelector('.skill-name,.name,strong')?.textContent || el.textContent || '');
      if (!skillId || !name) continue;
      if (isBuiltInSlashSkill({ skillId, name })) continue;
      const text = normalizeSpace(el.textContent || '');
      const manaMatch = text.match(/(\d[\d,]*)\s*(?:MP|MANA)\b/i);
      const staminaMatch = text.match(/(\d[\d,]*)\s*(?:STAM|STAMINA)\b/i);
      const manaCost = manaMatch ? parseNumber(manaMatch[1]) : null;
      const staminaDisplayCost = staminaMatch ? parseNumber(staminaMatch[1]) : null;
      const behaviorHint = normalizeName(`${el.dataset?.skillType || ''} ${el.dataset?.type || ''} ${el.className || ''} ${text}`);
      const behavior = /\bbuff|boost|enhance|aura\b/.test(behaviorHint)
        ? 'buff'
        : (/\bdamage|attack|strike|direct\b/.test(behaviorHint) || Number(staminaDisplayCost) > 0 ? 'direct' : (Number(manaCost) > 0 ? 'buff' : (Number(skillId) > 0 ? 'direct' : 'unknown')));
      const img = el.querySelector('img');
      let icon = null;
      if (img?.getAttribute('src')) {
        try { icon = new URL(img.getAttribute('src'), location.origin).href; } catch (_) {}
      }
      const item = {
        skillId,
        name,
        manaCost: Number.isFinite(manaCost) ? Math.max(0, manaCost) : 0,
        staminaDisplayCost: Number.isFinite(staminaDisplayCost) ? Math.max(0, staminaDisplayCost) : 0,
        requestStaminaCost: 1,
        behavior,
        icon,
        text,
        discoveredAt: new Date().toISOString()
      };
      item.key = activeSkillKey(item);
      if (item.key) skills.push(item);
    }
    return skills;
  }
  function updateSkillCatalogFromDocument(doc) {
    const discovered = parseActiveSkillsFromBattle(doc);
    if (!discovered.length) return [];
    const now = new Date().toISOString();
    for (const skill of discovered) {
      const prev = state.skillCatalog[skill.key] || {};
      state.skillCatalog[skill.key] = { ...prev, ...skill, behavior:prev.learnedBehavior ? prev.behavior : skill.behavior, lastSeenAt: now };
    }
    for (const [key, skill] of Object.entries(state.skillCatalog)) {
      if (isBuiltInSlashSkill(skill)) delete state.skillCatalog[key];
    }
    saveObject(ENGINE_STORE.skillCatalog, state.skillCatalog);
    return discovered;
  }
  function getActiveSkills() {
    return Object.values(state.skillCatalog)
      .filter(skill => skill && skill.behavior !== 'unknown' && !isBuiltInSlashSkill(skill))
      .sort((a, b) => {
        if (a.behavior !== b.behavior) return a.behavior === 'buff' ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      })
      .map(skill => ({
        ...clone(skill),
        enabled: state.skillPolicy[skill.key]?.enabled === true
      }));
  }
  function setActiveSkillPolicy(key, patch) {
    if (!key || !state.skillCatalog[key]) return false;
    const current = state.skillPolicy[key] || {};
    state.skillPolicy[key] = {
      ...current,
      enabled: patch?.enabled != null ? !!patch.enabled : !!current.enabled,
      updatedAt: new Date().toISOString()
    };
    saveObject(ENGINE_STORE.skills, state.skillPolicy);
    pushLog('system', `${state.skillCatalog[key].name} ${state.skillPolicy[key].enabled ? 'enabled' : 'disabled'} for Active Skills.`);
    emit();
    return true;
  }
  function setActiveSkillTargetPolicy(key, patch) {
    if (!key || typeof key !== 'string') return false;
    const current = state.skillTargetPolicy[key] || {};
    state.skillTargetPolicy[key] = {
      ...current,
      enabled: patch?.enabled != null ? !!patch.enabled : !!current.enabled,
      updatedAt: new Date().toISOString()
    };
    saveObject(ENGINE_STORE.skillTargets, state.skillTargetPolicy);
    pushLog('system', `${state.targetCatalog[key]?.name || key} ${state.skillTargetPolicy[key].enabled ? 'enabled' : 'disabled'} for Active Skills.`);
    emit();
    return true;
  }
  function bulkSetActiveSkillTargetPolicies(keys, enabled = true) {
    if (!Array.isArray(keys)) return false;
    const uniqueKeys = [...new Set(keys.filter(key => typeof key === 'string' && key))];
    if (!uniqueKeys.length) return false;
    const value = !!enabled;
    const updatedAt = new Date().toISOString();
    let changed = 0;
    for (const key of uniqueKeys) {
      const current = state.skillTargetPolicy[key] || {};
      if (current.enabled === value) continue;
      state.skillTargetPolicy[key] = { ...current, enabled: value, updatedAt };
      changed += 1;
    }
    if (!changed) return true;
    const saved = saveObject(ENGINE_STORE.skillTargets, state.skillTargetPolicy);
    if (!saved) pushLog('error', 'Active Skill target bulk persistence failed.');
    else pushLog('system', `${changed} Active Skill target${changed === 1 ? '' : 's'} enabled.`);
    emit();
    return saved !== false;
  }
  function activeSkillsAllowedForTarget(target) {
    if (!target || !sourceAllowed(target)) return false;
    const keys = [target.logicalKey, target.policyKey].filter(Boolean);
    return keys.some(key => state.skillTargetPolicy[key]?.enabled === true);
  }
  function selectedActiveSkills(target = null) {
    if (target && !activeSkillsAllowedForTarget(target)) return { buffs: [], directs: [] };
    const enabled = getActiveSkills().filter(skill => skill.enabled);
    return {
      buffs: enabled.filter(skill => skill.behavior === 'buff'),
      directs: enabled.filter(skill => skill.behavior === 'direct')
    };
  }
  function detectDivineBattle(doc, target) {
    if (/\b(?:divine|sovereign)\b/i.test(String(target?.name || ''))) return true;
    if (!doc?.querySelectorAll) return false;
    const selectors = [
      '#monsterName', '#monster-name', '.monster-name', '.monster-title', '.boss-title',
      '.enemy-name', '.enemy-title', '.battle-title', '.title-badge', '.badge', '.chip'
    ];
    for (const selector of selectors) {
      for (const el of doc.querySelectorAll(selector)) {
        const text = normalizeSpace(el.textContent || '');
        if (/\b(?:divine|sovereign)\b/i.test(text)) return true;
      }
    }
    const monster = doc.querySelector('[data-monster-id], .monster-card, .battle-monster, .monster-panel, .enemy-panel');
    if (monster) {
      const attrs = [
        monster.getAttribute?.('data-title'), monster.getAttribute?.('data-rank'),
        monster.getAttribute?.('data-tier'), monster.getAttribute?.('data-type'),
        monster.getAttribute?.('class')
      ].filter(Boolean).join(' ');
      if (/\b(?:divine|sovereign)\b/i.test(attrs)) return true;
    }
    return false;
  }
  function findBuffRelayCarrier(target) {
    if (!target || target.source !== 'gate') return null;
    const entities = window.AURELIX?.getReport?.()?.entities;
    if (!Array.isArray(entities)) return null;
    const candidates = entities.filter(entity =>
      entity &&
      entity.source === 'gate' &&
      entity.status === 'alive' &&
      Number(entity.currentHp) > 0 &&
      Number(entity.gateId) === Number(target.gateId) &&
      Number(entity.waveId) === Number(target.waveId) &&
      Number(entity.runtimeId ?? entity.monsterId) !== Number(target.runtimeId ?? target.monsterId) &&
      !entity.specialType &&
      !entity.classifiedByTimer &&
      (entity.battleUrl || entity.runtimeId || entity.monsterId)
    );
    candidates.sort((a, b) => (Number(b.currentHp) || 0) - (Number(a.currentHp) || 0));
    return candidates[0] || null;
  }
  function markStateKey(target) {
    return runtimeEncounterKey(target) || slashModelKey(target);
  }
  function markTurns(target) {
    return Math.max(0, Number(state.markTurnsByEncounter[markStateKey(target)]) || 0);
  }
  function parseTurnCount(value) {
    const raw = String(value || '').toLowerCase();
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
    const words = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6 };
    return Object.prototype.hasOwnProperty.call(words, raw) ? words[raw] : null;
  }
  function updateMarkStateFromResponse(target, data) {
    if (!target || !data) return { active: markTurns(target) > 0, reduced: false, turns: markTurns(target), applied: false };
    const key = markStateKey(target);
    const before = markTurns(target);
    const currentLog = Array.isArray(data.logs) && data.logs.length ? data.logs[0] : null;
    const extra = normalizeSpace(currentLog?.EXTRA_INFO || '');
    const message = normalizeSpace(data?.message || '');
    const text = `${extra} ${message}`;
    const appliedMatch = text.match(/\bmarked(?:\s+you)?\s+(?:for\s+)?(\d+|one|two|three|four|five|six)\s+turns?\b/i);
    const leftMatch = text.match(/\b(\d+|zero|one|two|three|four|five|six)\s+turns?\s+left\b/i);
    const reduced = /(?:mark[^.]{0,80}reduc|reduc(?:ed|es|ing)?[^.]{0,100}(?:strike|damage))/i.test(text);
    let next = before;
    let applied = false;
    if (appliedMatch) {
      const count = parseTurnCount(appliedMatch[1]);
      if (count != null) {
        next = count;
        applied = true;
      }
    } else if (leftMatch && (reduced || /\bmark/i.test(text))) {
      const count = parseTurnCount(leftMatch[1]);
      if (count != null) next = count;
    } else if (before > 0) {
      next = Math.max(0, before - 1);
    }
    state.markTurnsByEncounter[key] = next;
    if (applied && next > 0) state.markTotalByEncounter[key] = next;
    const total = Math.max(next, before, Number(state.markTotalByEncounter[key]) || 0);
    const cleared = before > 0 && next === 0;
    if (cleared) state.markTotalByEncounter[key] = 0;
    return { active: next > 0, reduced, turns: next, applied, cleared, total };
  }
  function updateLiveExpFromAttack(data) {
    if (!data || typeof data !== 'object') return false;
    let changed = false;
    const directExp = parseNumber(data.exp ?? data.current_exp ?? data.currentExp ?? data.experience);
    const directMax = parseNumber(data.exp_max ?? data.expMax ?? data.max_exp ?? data.maxExp ?? data.experience_max);
    const directLevel = parseNumber(data.level ?? data.current_level ?? data.currentLevel);
    if (Number.isFinite(directExp) && directExp >= 0) {
      state.liveResources.exp = directExp;
      changed = true;
    }
    if (Number.isFinite(directMax) && directMax > 0) {
      state.liveResources.expMax = directMax;
      changed = true;
    }
    if (Number.isFinite(directLevel) && directLevel > 0) {
      state.liveResources.level = Math.floor(directLevel);
      changed = true;
    }
    const delta = parseNumber(data.xp_delta ?? data.exp_delta ?? data.xpDelta ?? data.expDelta);
    if (!Number.isFinite(directExp) && Number.isFinite(delta) && delta !== 0) {
      const current = Number(state.liveResources.exp);
      const fallback = Number(window.AURELIX?.getReport?.()?.resources?.player?.exp);
      const base = Number.isFinite(current) ? current : fallback;
      if (Number.isFinite(base)) {
        state.liveResources.exp = Math.max(0, base + delta);
        changed = true;
      }
    }
    return changed;
  }
  async function performRelayedBuff(mainTarget, skill, damageBefore = null) {
    const carrier = findBuffRelayCarrier(mainTarget);
    if (!carrier) {
      pushLog('warning', `${skill.name}: no alive normal mob is available in ${mainTarget.waveDisplay || mainTarget.waveName || 'this wave'} for buff relay.`);
      return { ok: true, skippedBuff: true, damage: Number.isFinite(Number(damageBefore)) ? Number(damageBefore) : (Number(state.encounterLedger[runtimeEncounterKey(mainTarget)]?.damage) || 0) };
    }
    let snapshot = await fetchBattleSnapshot(carrier);
    if (!snapshot.ok || !snapshot.identityOk) {
      pushLog('warning', `${skill.name}: buff relay carrier ${carrier.name} changed before use.`);
      return { ok: true, skippedBuff: true };
    }
    if (snapshot.joinRequired) {
      if (!await joinTarget(carrier, snapshot)) return { ok: true, skippedBuff: true };
      await sleep(200);
      snapshot = await fetchBattleSnapshot(carrier);
      if (!snapshot.ok || !snapshot.identityOk) return { ok: true, skippedBuff: true };
    }
    const beforeStamina = Number(currentStamina());
    const body = new URLSearchParams();
    body.set('monster_id', String(carrier.monsterId ?? carrier.runtimeId));
    body.set('skill_id', String(skill.skillId));
    body.set('stamina_cost', String(skill.requestStaminaCost ?? 1));
    const { res, text } = await fetchText('/damage.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: state.abortController?.signal
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000);
      return { ok: true, cooldownOnly: true };
    }
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    const message = normalizeSpace(data?.message || data?.error || text);
    if (!res.ok || !data || (data.status && data.status !== 'success')) {
      pushLog('warning', `${skill.name} buff relay rejected on ${carrier.name}: ${message || `HTTP ${res.status}`}`);
      return { ok: true, skippedBuff: true };
    }
    const afterStamina = parseNumber(data.stamina);
    const afterMana = parseNumber(data.mana);
    if (Number.isFinite(afterStamina)) state.liveResources.stamina = afterStamina;
    if (Number.isFinite(afterMana)) state.liveResources.mana = afterMana;
    if (data.retaliation?.user_hp_after != null) state.liveResources.hp = Number(data.retaliation.user_hp_after);
    updateLiveExpFromAttack(data);
    const spentStamina = Number.isFinite(beforeStamina) && Number.isFinite(afterStamina)
      ? Math.max(0, beforeStamina - afterStamina)
      : Math.max(0, Number(skill.staminaDisplayCost) || 0);
    state.session.stats.attacks += 1;
    state.session.stats.staminaUsed += spentStamina;
    pushLog('skill', `✨ ${skill.name} relayed through ${carrier.name} → ${mainTarget.name}.`);
    emit();
    await sleep(state.settings.attackCooldownMs);
    return { ok: true, relayed: true, damage: Number.isFinite(Number(damageBefore)) ? Number(damageBefore) : (Number(state.encounterLedger[runtimeEncounterKey(mainTarget)]?.damage) || 0) };
  }
  function parsePlayerManaFromBattle(doc) {
    if (!doc?.querySelectorAll) return null;
    for (const selector of ['#pManaText', '#player-mana', '#your-mana', '[data-player-mana]', '[data-user-mana]', '.player-mana', '.mana-value']) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      const raw = el.dataset?.playerMana ?? el.dataset?.userMana ?? el.dataset?.mana ?? el.textContent ?? '';
      const pair = parseResourcePair(raw);
      if (pair && Number.isFinite(pair.current)) return pair;
      const n = parseNumber(raw);
      if (Number.isFinite(n)) return { current: n, max: null };
    }
    const scripts = [...doc.scripts].map(x => x.textContent || '').join('\n');
    const maxMatch = scripts.match(/\bPLAYER_MAX_MANA\s*=\s*(\d+)/);
    const text = normalizeSpace(doc.body?.textContent || '');
    const pair = text.match(/(?:MP|MANA)\s*[:\-]?\s*([\d,]+)\s*\/\s*([\d,]+)/i) || text.match(/([\d,]+)\s*\/\s*([\d,]+)\s*(?:MP|MANA)/i);
    if (pair) return { current: parseNumber(pair[1]), max: parseNumber(pair[2]) };
    return maxMatch ? { current: null, max: Number(maxMatch[1]) } : null;
  }
  function parseBattleCfg(doc) {
    const scripts = [...doc.scripts].map(s => s.textContent || '').join('\n');
    const block = (scripts.match(/window\.BATTLE_CFG\s*=\s*\{[\s\S]*?\};/) || [''])[0];
    const read = (re, fallback = null) => {
      const m = block.match(re);
      return m ? m[1] : fallback;
    };
    return {
      isDungeon: read(/\bisDungeon\s*:\s*(true|false)/) === 'true',
      isGlobal: read(/\bisGlobal\s*:\s*(true|false)/) === 'true',
      id: Number(read(/(?:^|[,\s])id\s*:\s*(\d+)/)) || 0,
      instanceId: Number(read(/\binstanceId\s*:\s*(\d+)/)) || 0,
      dgmid: Number(read(/\bdgmid\s*:\s*(\d+)/)) || 0
    };
  }
  function parseUserId(doc) {
    const scripts = [...doc.scripts].map(s => s.textContent || '').join('\n');
    const patterns = [
      /p\.set\(\s*['\"]user_id['\"]\s*,\s*['\"]?(\d+)['\"]?\s*\)/,
      /\bconst\s+USER_ID\s*=\s*['\"]?(\d+)['\"]?\s*;/,
      /\bUSER_ID\s*[:=]\s*['\"]?(\d+)['\"]?/
    ];
    for (const re of patterns) {
      const m = scripts.match(re);
      if (m) return m[1];
    }
    const demon = readCookie('demon');
    return /^\d+$/.test(demon) ? demon : '';
  }
  function parseYourDamage(doc) {
    const direct = [
      doc.querySelector('#yourDamageValue'),
      doc.querySelector('[data-your-damage]'),
      doc.querySelector('[data-userdmg]'),
      doc.querySelector('[data-user-damage]')
    ].filter(Boolean);
    for (const el of direct) {
      const raw = el.dataset?.yourDamage ?? el.dataset?.userdmg ?? el.dataset?.userDamage ?? el.textContent;
      const n = parseNumber(raw);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    const text = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
    for (const re of [
      /your\s*damage[^0-9]*([\d,]+(?:\.\d+)?)/i,
      /\byou\s*:\s*([\d,]+(?:\.\d+)?)/i,
      /damage\s*dealt[^0-9]*([\d,]+(?:\.\d+)?)/i
    ]) {
      const m = text.match(re);
      if (m) {
        const n = parseNumber(m[1]);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
    return null;
  }
  function extractBattleImageUrl(node) {
    if (!node) return null;
    const resolve = raw => {
      const value = String(raw || '').trim();
      if (!value || /^(?:javascript:|about:blank)/i.test(value)) return null;
      try { return new URL(value, location.origin).href; } catch (_) { return null; }
    };
    const fromElement = el => {
      if (!el) return null;
      const attrs = [
        el.getAttribute?.('src'),
        el.getAttribute?.('data-src'),
        el.getAttribute?.('data-lazy-src'),
        el.getAttribute?.('data-original'),
        el.getAttribute?.('data-image'),
        el.getAttribute?.('data-img'),
        el.dataset?.src,
        el.dataset?.image,
        el.dataset?.img
      ];
      for (const raw of attrs) {
        const url = resolve(raw);
        if (url) return url;
      }
      const srcset = el.getAttribute?.('srcset') || el.getAttribute?.('data-srcset') || '';
      if (srcset) {
        const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
        const url = resolve(first);
        if (url) return url;
      }
      const style = el.getAttribute?.('style') || '';
      const bg = style.match(/background(?:-image)?\s*:[^;]*url\(["']?([^"')]+)["']?\)/i)?.[1];
      return resolve(bg);
    };
    const direct = fromElement(node);
    if (direct) return direct;
    const image = node.querySelector?.('img,source,[data-src],[data-image],[data-img],[style*="background"]');
    return fromElement(image);
  }
  function parseBattleMonsterImage(doc) {
    if (!doc) return null;
    const selectors = [
      '.monster-card', '.battle-monster', '.monster-panel', '.enemy-panel',
      '.monster', '.enemy', '[data-monster-id]', '[data-dgmid]'
    ];
    for (const selector of selectors) {
      for (const node of doc.querySelectorAll(selector)) {
        const url = extractBattleImageUrl(node);
        if (url) return url;
      }
    }
    const og = doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.getAttribute('content');
    if (og) {
      try { return new URL(og, location.origin).href; } catch (_) {}
    }
    return null;
  }
  function findPhaseDuel(doc) {
    for (const a of doc.querySelectorAll('a[href*="pvp_style_battle.php"]')) {
      try {
        const url = new URL(a.getAttribute('href') || a.href, location.origin);
        if (url.searchParams.get('source') !== 'monster_phase') continue;
        const activeId = String(url.searchParams.get('active_id') || '').trim();
        if (!activeId) continue;
        return { url: url.href, activeId };
      } catch (_) {}
    }
    return null;
  }
  function findBackUrl(doc, fallback) {
    const candidates = [...doc.querySelectorAll('a[href]')];
    const back = candidates.find(a => /\bback\b/i.test(normalizeSpace(a.textContent)) && /battle\.php/i.test(a.getAttribute('href') || ''));
    return back ? new URL(back.getAttribute('href'), location.origin).href : fallback;
  }
  function validateBattleIdentity(target, cfg) {
    if (target.source === 'dungeon') {
      return cfg.isDungeon && Number(cfg.instanceId) === Number(target.instanceId) && Number(cfg.dgmid) === Number(target.dgmid ?? target.runtimeId);
    }
    return !cfg.isDungeon && Number(cfg.id) === Number(target.monsterId ?? target.runtimeId);
  }
  function parsePlayerHpFromBattle(doc) {
    if (!doc?.querySelectorAll) return null;
    const candidates = [
      '#player-hp', '#your-hp', '#user-hp', '[data-player-hp]', '[data-user-hp]',
      '.your-hp', '.player-hp', '.user-hp', '.hp-player', '.battle-player-hp'
    ];
    for (const selector of candidates) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      const dataValue = el.dataset?.playerHp ?? el.dataset?.userHp ?? el.dataset?.hp;
      const pair = parseResourcePair(dataValue ?? el.textContent ?? '');
      if (pair && Number.isFinite(pair.current)) return pair;
      const n = parseNumber(dataValue ?? el.textContent);
      if (Number.isFinite(n)) return { current: n, max: null };
    }
    const textNodes = [...doc.querySelectorAll('div,span,p,strong')];
    for (const el of textNodes) {
      const txt = normalizeSpace(el.textContent || '');
      if (!/\b(?:your\s+hp|player\s+hp|hp)\b/i.test(txt)) continue;
      const pair = parseResourcePair(txt);
      if (pair && Number.isFinite(pair.current)) return pair;
    }
    return null;
  }
  function invalidateCombatPreflight(target = null) {
    const key = target ? runtimeEncounterKey(target) : null;
    if (!key || state.combatPreflight.key === key) {
      state.combatPreflight = { key: null, snapshot: null, fetchedAt: 0, actionsSinceFresh: 0 };
    }
  }
  async function combatPreflight(target, forceFresh = false) {
    const key = runtimeEncounterKey(target);
    const cache = state.combatPreflight;
    const age = Date.now() - Number(cache.fetchedAt || 0);
    const reusable = !forceFresh && cache.key === key && cache.snapshot?.ok && cache.snapshot?.identityOk && age < 2500 && Number(cache.actionsSinceFresh || 0) < 5;
    if (reusable) return cache.snapshot;
    const snapshot = await fetchBattleSnapshot(target);
    if (snapshot?.ok && snapshot?.identityOk) {
      state.combatPreflight = { key, snapshot, fetchedAt: Date.now(), actionsSinceFresh: 0 };
    } else invalidateCombatPreflight(target);
    return snapshot;
  }
  function noteCombatAction(target) {
    const key = runtimeEncounterKey(target);
    if (state.combatPreflight.key === key) state.combatPreflight.actionsSinceFresh = Number(state.combatPreflight.actionsSinceFresh || 0) + 1;
  }
  function acceptAuthoritativeAttackTotal(target, priorTotal, data) {
    const total = parseNumber(data?.totaldmgdealt);
    const prior = Number(priorTotal);
    if (!Number.isFinite(total) || total < 0 || (Number.isFinite(prior) && total < prior)) {
      invalidateCombatPreflight(target);
      return null;
    }
    recordEncounterDamage(target, total);
    const key = runtimeEncounterKey(target);
    if (state.combatPreflight.key === key && state.combatPreflight.snapshot?.ok) {
      state.combatPreflight.snapshot.userDamage = total;
    }
    return total;
  }
  async function requireAuthoritativeAttackTotal(target, priorTotal, data, label = 'Attack') {
    const total = acceptAuthoritativeAttackTotal(target, priorTotal, data);
    if (Number.isFinite(total)) return { ok: true, total };
    pushLog('warning', `${label} response had no trustworthy cumulative damage; verifying server total before continuing.`);
    const resolved = await resolveUncertainAttack(target, priorTotal);
    return { ok: resolved.resolved, total: resolved.damage, reason: resolved.resolved ? null : 'missing-authoritative-total' };
  }
  async function fetchBattleSnapshot(target) {
    const url = battleUrlFor(target);
    const { res, text } = await fetchText(url, { signal: state.abortController?.signal });
    if (!res.ok) return { ok: false, status: res.status, url: res.url || url, text };
    const doc = docFromHtml(text);
    const cfg = parseBattleCfg(doc);
    updateSkillCatalogFromDocument(doc);
    const identityOk = validateBattleIdentity(target, cfg);
    const snapshot = {
      ok: true,
      url: res.url || url,
      doc,
      cfg,
      identityOk,
      userId: parseUserId(doc),
      userDamage: parseYourDamage(doc),
      image: parseBattleMonsterImage(doc),
      joinRequired: !!doc.querySelector('#join-battle'),
      phaseDuel: findPhaseDuel(doc),
      playerHp: parsePlayerHpFromBattle(doc),
      playerMana: parsePlayerManaFromBattle(doc),
      activeSkills: getActiveSkills(),
      divine: detectDivineBattle(doc, target),
      text
    };
    if (identityOk) {
      syncCurrentTargetVisual(target, snapshot);
      if (snapshot.playerMana && Number.isFinite(Number(snapshot.playerMana.current))) state.liveResources.mana = Number(snapshot.playerMana.current);
      if (snapshot.playerMana && Number.isFinite(Number(snapshot.playerMana.max))) state.liveResources.manaMax = Number(snapshot.playerMana.max);
    }
    return snapshot;
  }
  function syncCurrentTargetVisual(target, snapshot) {
    const image = snapshot?.image || target?.image || target?.imageUrl || null;
    if (!image || !state.currentTarget || !sameRuntimeTarget(state.currentTarget, target)) return;
    if (state.currentTarget.image === image && state.currentTarget.imageUrl === image) return;
    state.currentTarget.image = image;
    state.currentTarget.imageUrl = image;
    emit();
  }
  async function joinTarget(target, snapshot) {
    if (!snapshot?.joinRequired) return true;
    if (!snapshot.userId) {
      pushLog('error', `Cannot join ${target.name}: user ID was not found on the battle page.`);
      return false;
    }
    const body = new URLSearchParams();
    if (target.source === 'dungeon') {
      body.set('instance_id', String(target.instanceId));
      body.set('dgmid', String(target.dgmid ?? target.runtimeId));
    } else {
      body.set('monster_id', String(target.monsterId ?? target.runtimeId));
    }
    body.set('user_id', String(snapshot.userId));
    const endpoint = target.source === 'dungeon' ? '/dungeon_join_battle.php' : '/user_join_battle.php';
    const { res, text } = await fetchText(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: state.abortController?.signal
    });
    const msg = normalizeSpace(text);
    const ok = res.ok && (/^you have successfully/i.test(msg) || /already\s+joined/i.test(msg));
    if (ok) pushLog('combat', `Joined ${target.name}.`);
    else pushLog('warning', `Join failed for ${target.name}: ${msg || `HTTP ${res.status}`}`);
    return ok;
  }
  function phaseWasCleared(data) {
    return data?.room_status === 'cleared' || (data?.match?.ended === true && data?.match?.winner_side === 'ally');
  }
  async function handleMonsterPhase(target, phase) {
    pushLog('phase', `Entering Phase Duel for ${target.name}.`);
    const entered = await fetchText(phase.url, { signal: state.abortController?.signal });
    if (!entered.res.ok) {
      pushLog('warning', `Phase Duel entry failed for ${target.name} — HTTP ${entered.res.status}.`);
      return { ok: false, reason: 'phase-entry-failed' };
    }
    const phaseDoc = docFromHtml(entered.text);
    const backUrl = findBackUrl(phaseDoc, battleUrlFor(target));
    let sinceLogId = 0;
    const startedAt = Date.now();
    while (state.status === ENGINE_STATES.RUNNING && sameRuntimeTarget(state.currentTarget, target)) {
      if (Date.now() - startedAt > 20 * 60_000) {
        pushLog('warning', `Phase Duel timed out for ${target.name}; deferring target.`);
        return { ok: false, reason: 'phase-timeout' };
      }
      const url = new URL('/pvp_style_state.php', location.origin);
      url.searchParams.set('source', 'monster_phase');
      url.searchParams.set('since_log_id', String(sinceLogId));
      url.searchParams.set('active_id', String(phase.activeId));
      const { res, text } = await fetchText(url.href, { signal: state.abortController?.signal });
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || !data || data.ok === false) {
        pushLog('warning', `Phase Duel state failed for ${target.name}; deferring target.`);
        return { ok: false, reason: 'phase-state-failed' };
      }
      const logs = Array.isArray(data.new_logs) ? data.new_logs : [];
      for (const item of logs) {
        const id = Number(item?.id ?? item?.log_id);
        if (Number.isFinite(id)) sinceLogId = Math.max(sinceLogId, id);
      }
      if (phaseWasCleared(data)) {
        pushLog('phase', `Phase Duel cleared for ${target.name}; confirming Phase 3 before resuming combat.`);
        for (let attempt = 1; attempt <= 10; attempt++) {
          await sleep(attempt === 1 ? 180 : 500);
          const returned = await fetchText(backUrl, { signal: state.abortController?.signal });
          if (!returned.res.ok) continue;
          const returnedDoc = docFromHtml(returned.text);
          const returnedCfg = parseBattleCfg(returnedDoc);
          const stillInDuel = !!findPhaseDuel(returnedDoc);
          if (validateBattleIdentity(target, returnedCfg) && !stillInDuel) {
            markPhase3(target);
            pushLog('phase', `Phase 3 confirmed for ${target.name}.`);
            return { ok: true, cleared: true, backUrl };
          }
        }
        pushLog('phase', `Phase 3 is not available yet for ${target.name}; deferring it and continuing with another ready monster.`);
        return { ok: false, reason: 'phase3-not-ready' };
      }
      if (data?.match?.ended === true && data?.match?.winner_side && data.match.winner_side !== 'ally') {
        pushLog('warning', `Phase Duel was not won for ${target.name}; Phase 3 will not be entered.`);
        return { ok: false, reason: 'phase-lost' };
      }
      await sleep(state.settings.phasePollMs);
    }
    return { ok: false, reason: 'stopped' };
  }
  async function preparePhase3Combat(target) {
    resetSlashModel(target, 'Phase 2 completed; recalibrating Phase 3');
    resetDirectSkillModels(target);
    state.markTurnsByEncounter[markStateKey(target)] = 0;
    invalidateCombatPreflight(target);
    let snapshot = await combatPreflight(target, true);
    if (!snapshot.ok || !snapshot.identityOk) {
      await reconcileScanner();
      return { ok: false, reason: 'phase3-stale-target' };
    }
    if (snapshot.joinRequired) {
      if (!await joinTarget(target, snapshot)) return { ok: false, reason: 'phase3-join-failed' };
      await sleep(200);
      invalidateCombatPreflight(target);
      snapshot = await combatPreflight(target, true);
      if (!snapshot.ok || !snapshot.identityOk) {
        await reconcileScanner();
        return { ok: false, reason: 'phase3-stale-after-join' };
      }
    }
    const baseline = Number(snapshot.userDamage);
    if (!Number.isFinite(baseline) || baseline < 0) {
      pushLog('warning', `Phase 3 damage baseline could not be verified for ${target.name}; no Phase 3 attack sent.`);
      await reconcileScanner();
      return { ok: false, reason: 'phase3-baseline-unknown' };
    }
    const progress = getPhaseProgress(target);
    progress.stage = 'phase3';
    progress.phase3Baseline = baseline;
    progress.phase3RuntimeKey = runtimeEncounterKey(target);
    delete state.encounterLedger[runtimeEncounterKey(target)];
    recordEncounterDamage(target, baseline);
    target.currentUserDamage = baseline;
    target.userDamage = baseline;
    applyCurrentPhaseBudget(target, baseline);
    return { ok: true, damage: baseline, snapshot };
  }
  function slashModelKey(target) {
    if (!target) return 'unknown';
    if (target.source === 'dungeon') {
      return `dungeon:${target.instanceId ?? '?'}:${target.locationId ?? '?'}:${target.dgmid ?? target.runtimeId ?? '?'}`;
    }
    return `gate:${target.monsterId ?? target.runtimeId ?? '?'}`;
  }
  function getSlashModel(target) {
    const key = slashModelKey(target);
    let model = state.slashModels.get(key);
    if (!model) {
      model = new AdaptiveSlashModel();
      state.slashModels.set(key, model);
    }
    return model;
  }
  function resetSlashModel(target, reason = '') {
    const key = slashModelKey(target);
    state.slashModels.delete(key);
    if (reason) pushLog('scan', `Damage calibration reset for ${target?.name || 'target'} (${reason}).`);
  }
  async function authoritativeDamage(target, snapshot = null) {
    let damage = null;
    const ledger = Number(state.encounterLedger[runtimeEncounterKey(target)]?.damage);
    const scanValue = Number(target.currentUserDamage ?? target.userDamage);
    if (Number.isFinite(scanValue) && scanValue >= 0) damage = scanValue;
    if (snapshot && Number.isFinite(Number(snapshot.userDamage)) && Number(snapshot.userDamage) >= 0) {
      damage = damage == null ? Number(snapshot.userDamage) : Math.max(damage, Number(snapshot.userDamage));
    }
    if (Number.isFinite(ledger) && ledger >= 0) damage = damage == null ? ledger : Math.max(damage, ledger);
    return damage;
  }
  function currentStamina() {
    const live = nullableNumber(state.liveResources.stamina);
    if (live != null && live >= 0) return live;
    const report = window.AURELIX?.getReport?.();
    const fromReport = nullableNumber(report?.resources?.player?.stamina);
    return fromReport != null && fromReport >= 0 ? fromReport : null;
  }
  function currentHp() {
    const live = nullableNumber(state.liveResources.hp);
    if (live != null && live >= 0) return live;
    const report = window.AURELIX?.getReport?.();
    const fromReport = nullableNumber(report?.resources?.player?.hp);
    return fromReport != null && fromReport >= 0 ? fromReport : null;
  }
  function currentMana() {
    const live = nullableNumber(state.liveResources.mana);
    if (live != null && live >= 0) return live;
    const report = window.AURELIX?.getReport?.();
    const fromReport = nullableNumber(report?.resources?.player?.mana);
    return fromReport != null && fromReport >= 0 ? fromReport : null;
  }
  function potionInventory() {
    const report = window.AURELIX?.getReport?.();
    const raw = report?.potions || report?.resources?.potions || [];
    return Array.isArray(raw) ? raw : Object.values(raw || {});
  }
  function selectedPotion(kind) {
    migratePotionPoliciesFromReport();
    const options = potionInventory().filter(p => p && p.type === kind);
    for (const potion of options) {
      const resolved = policyForPotion(potion);
      const policy = resolved.policy || {};
      const usageKey = resolved.key || stablePotionPolicyKey(potion) || potion.key;
      if (policy.enabled !== true) continue;
      const used = Math.max(0, Number(state.potionUsage[usageKey]) || 0);
      const limit = Math.max(0, Number(policy.limit) || 0);
      const count = Number(potion.count ?? potion.max);
      if (limit > 0 && used >= limit) continue;
      if (Number.isFinite(count) && count <= 0) continue;
      return { potion, policy, used, limit, usageKey };
    }
    return null;
  }
  function parseResourcePair(text) {
    const match = String(text || '').match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!match) return null;
    const current = parseNumber(match[1]);
    const max = parseNumber(match[2]);
    return Number.isFinite(current) && Number.isFinite(max) ? { current, max } : null;
  }
  function updateLiveResourcesFromDocument(doc) {
    if (!doc?.querySelectorAll) return false;
    let changed = false;
    const staminaBox = [...doc.querySelectorAll('.gtb-value')].find(el => el.querySelector('#stamina_span'));
    const stamina = parseResourcePair(staminaBox?.textContent || '');
    if (stamina) {
      state.liveResources.stamina = stamina.current;
      state.liveResources.staminaMax = stamina.max;
      changed = true;
    }
    const expSpans = doc.querySelector('.gtb-exp-top')?.querySelectorAll('span');
    const exp = expSpans?.length ? parseResourcePair(expSpans[expSpans.length - 1]?.textContent || '') : null;
    if (exp) {
      state.liveResources.exp = exp.current;
      state.liveResources.expMax = exp.max;
      changed = true;
    }
    const levelEl = doc.querySelector('.gtb-level,.small-user .small-level,.small-level,[data-user-level]');
    if (levelEl) {
      const level = parseNumber(levelEl.dataset?.userLevel ?? levelEl.textContent);
      if (Number.isFinite(level) && level > 0) {
        state.liveResources.level = Math.floor(level);
        changed = true;
      }
    }
    for (const row of doc.querySelectorAll('.resource-row,.player-resource,.res-row')) {
      const label = normalizeName(row.querySelector('.res-label,.label,strong')?.textContent || row.textContent || '');
      const pair = parseResourcePair(row.querySelector('.res-meta,.value')?.textContent || row.textContent || '');
      if (!pair) continue;
      if (/\bhp\b|\bhealth\b/.test(label)) {
        state.liveResources.hp = pair.current;
        state.liveResources.hpMax = pair.max;
        changed = true;
      }
      if (/\bstamina\b/.test(label)) {
        state.liveResources.stamina = pair.current;
        state.liveResources.staminaMax = pair.max;
        changed = true;
      }
      if (/\bmana\b|\bmp\b/.test(label)) {
        state.liveResources.mana = pair.current;
        state.liveResources.manaMax = pair.max;
        changed = true;
      }
      if (/\bexp\b|\bxp\b/.test(label)) {
        state.liveResources.exp = pair.current;
        state.liveResources.expMax = pair.max;
        changed = true;
      }
    }
    return changed;
  }
  async function refreshLiveResourcesAfterPotion() {
    try {
      const { res, text } = await fetchText('/inventory.php', { signal: state.abortController?.signal });
      if (!res.ok) return false;
      return updateLiveResourcesFromDocument(docFromHtml(text));
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return false;
    }
  }
  async function useEmergencyPotion(kind, options = {}) {
    if (state.potionInFlight || state.status !== ENGINE_STATES.RUNNING) return false;
    const selected = selectedPotion(kind);
    if (!selected) {
      pushLog('warning', `No usable selected ${kind === 'hp' ? 'HP' : (kind === 'mana' ? 'mana' : 'stamina')} potion is available or its limit has been reached.`);
      return false;
    }
    const { potion, used, limit, usageKey } = selected;
    const invId = potion.invId ?? potion.inv_id ?? potion.itemId ?? potion.item;
    if (invId == null) {
      pushLog('warning', `${potion.name || 'Selected potion'} has no usable inventory id.`);
      return false;
    }
    const beforeMana = Number(currentMana());
    const beforeStamina = Number(currentStamina());
    const maxMana = Number(state.liveResources.manaMax ?? window.AURELIX?.getReport?.()?.resources?.player?.manaMax);
    const maxStamina = Number(state.liveResources.staminaMax ?? window.AURELIX?.getReport?.()?.resources?.player?.staminaMax);
    const learnedRestore = Number(state.observedPotionRestore[usageKey]);
    const declaredRestore = Number(potion.restoreAmount ?? potion.restore ?? potion.amount);
    const restorePerPotion = learnedRestore > 0 ? learnedRestore : (declaredRestore > 0 ? declaredRestore : null);
    const count = Number(potion.count ?? potion.max);
    const remainingByLimit = limit > 0 ? Math.max(0, limit - used) : Infinity;
    const remainingByCount = Number.isFinite(count) && count >= 0 ? Math.max(0, count - used) : Infinity;
    let qty = 1;
    if (kind === 'mana' && options.fillToMax === true && Number.isFinite(beforeMana) && Number.isFinite(maxMana) && maxMana > beforeMana && restorePerPotion > 0) {
      const gap = maxMana - beforeMana;
      const wholeFit = Math.ceil(gap / restorePerPotion);
      qty = Math.max(1, wholeFit);
    }
    // Stamina is deliberately single-use. Every request must be followed by a
    // fresh resource read and a new combat decision; never send a stamina batch.
    if (kind === 'stamina') qty = 1;
    qty = Math.max(1, Math.min(qty, remainingByLimit, remainingByCount));
    if (!(qty > 0) || !Number.isFinite(qty)) qty = 1;
    qty = Math.floor(qty);
    state.potionInFlight = true;
    try {
      const makeRequest = async requestQty => {
        const form = new FormData();
        form.append('inv_id', String(invId));
        if (kind === 'stamina' || kind === 'mana') form.append('qty', String(requestQty));
        return fetchText(kind === 'hp' ? '/user_heal_potion.php' : '/use_item.php', {
          method: 'POST',
          body: form,
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          signal: state.abortController?.signal
        });
      };
      let requestQty = qty;
      let { res, text } = await makeRequest(requestQty);
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}
      let message = normalizeSpace(data?.message || data?.error || text);
      let fullHp = kind === 'hp' && /already\s+at\s+full\s+hp/i.test(message);
      let success = fullHp || (res.ok && (data ? data.status === 'success' || data.ok === true : /consumed successfully|success/i.test(text)));
      if (!success && requestQty > 1 && kind !== 'hp') {
        pushLog(kind === 'hp' ? 'hp' : (kind === 'mana' ? 'mana' : 'stamina'), `${potion.name || 'Potion'} batch ×${requestQty} was not accepted; retrying one potion.`);
        requestQty = 1;
        ({ res, text } = await makeRequest(1));
        data = null;
        try { data = JSON.parse(text); } catch (_) {}
        message = normalizeSpace(data?.message || data?.error || text);
        success = res.ok && (data ? data.status === 'success' || data.ok === true : /consumed successfully|success/i.test(text));
      }
      if (!success) {
        pushLog('warning', `${kind === 'hp' ? 'HP' : (kind === 'mana' ? 'Mana' : 'Stamina')} potion failed: ${message || `HTTP ${res.status}`}`);
        return false;
      }
      const consumed = fullHp ? 0 : requestQty;
      if (kind === 'mana' && consumed > 1) {
        pushLog('mana', `Mana batch ×${consumed} ${potion.name || 'Potion'}${Number.isFinite(beforeMana) && Number.isFinite(maxMana) ? ` (${Math.round(beforeMana)}/${Math.round(maxMana)} MP → refill)` : ''}.`);
      }
      state.potionUsage[usageKey] = used + consumed;
      if (consumed > 0) {
        state.session.stats.potions += consumed;
        if (kind === 'hp') state.session.stats.hpPotions += consumed;
        else if (kind === 'stamina') state.session.stats.staminaPotions += consumed;
        else if (kind === 'mana') state.session.stats.manaPotions += consumed;
      }
      if (data) {
        const stamina = parseNumber(data.stamina ?? data.current_stamina);
        const hp = parseNumber(data.hp ?? data.current_hp ?? data.user_hp_after);
        const mana = parseNumber(data.mana ?? data.current_mana);
        if (Number.isFinite(stamina)) state.liveResources.stamina = stamina;
        if (Number.isFinite(hp)) state.liveResources.hp = hp;
        if (Number.isFinite(mana)) state.liveResources.mana = mana;
      }
      await refreshLiveResourcesAfterPotion();
      if (consumed > 0) {
        if (kind === 'mana') {
          const after = Number(currentMana());
          if (Number.isFinite(beforeMana) && Number.isFinite(after) && after > beforeMana) {
            const observed = (after - beforeMana) / consumed;
            if (observed > 0) state.observedPotionRestore[usageKey] = observed;
          } else if (restorePerPotion > 0) {
            state.liveResources.mana = Math.min(Number.isFinite(maxMana) && maxMana > 0 ? maxMana : Infinity, Math.max(0, Number.isFinite(beforeMana) ? beforeMana : 0) + restorePerPotion * consumed);
          }
        } else if (kind === 'stamina') {
          const after = Number(currentStamina());
          if (Number.isFinite(beforeStamina) && Number.isFinite(after) && after > beforeStamina) {
            const observed = (after - beforeStamina) / consumed;
            if (observed > 0) state.observedPotionRestore[usageKey] = observed;
          }
        }
      }
      if (kind === 'hp') await sleep(250);
      if (kind === 'hp' && !(Number(state.liveResources.hp) > 0)) {
        try {
          const target = state.currentTarget;
          if (target) {
            const freshBattle = await fetchBattleSnapshot(target);
            if (freshBattle?.ok && freshBattle?.playerHp && Number(freshBattle.playerHp.current) > 0) {
              state.liveResources.hp = Number(freshBattle.playerHp.current);
              if (Number(freshBattle.playerHp.max) > 0) state.liveResources.hpMax = Number(freshBattle.playerHp.max);
            }
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
        }
        if (!(Number(state.liveResources.hp) > 0)) {
          const hpMax = Number(state.liveResources.hpMax || window.AURELIX?.getReport?.()?.resources?.player?.hpMax);
          state.liveResources.hp = Number.isFinite(hpMax) && hpMax > 0 ? hpMax : 1;
        }
      }
      const limitText = limit > 0 ? `${state.potionUsage[usageKey]}/${limit}` : `${state.potionUsage[usageKey]}`;
      const icon = kind === 'hp' ? '❤' : (kind === 'mana' ? '💧' : '⚡');
      pushLog(kind === 'hp' ? 'hp' : (kind === 'mana' ? 'mana' : 'stamina'), `${icon} AUTO ${kind.toUpperCase()} — used ${consumed || 0} × ${potion.name || 'potion'} (${limitText} used).`);
      if (kind === 'mana' && options.fillToMax === true) {
        const now = Number(currentMana());
        const max = Number(state.liveResources.manaMax);
        if (Number.isFinite(now)) pushLog('mana', `Mana recovery: ${Math.round(now).toLocaleString()}${Number.isFinite(max) && max > 0 ? `/${Math.round(max).toLocaleString()}` : ''} MP.`);
      }
      if (kind === 'stamina') {
        const now = Number(currentStamina());
        const max = Number(state.liveResources.staminaMax);
        if (Number.isFinite(now)) pushLog('stamina', `Stamina after one ${potion.name || 'potion'}: ${Math.round(now).toLocaleString()}${Number.isFinite(max) && max > 0 ? `/${Math.round(max).toLocaleString()}` : ''}.`);
      }
      if (kind === 'hp') pushLog('hp', `HP recovery confirmed (${Math.round(Number(state.liveResources.hp) || 1).toLocaleString()} HP). Resuming combat.`);
      emit();
      await sleep(120);
      return true;
    } finally {
      state.potionInFlight = false;
    }
  }
  function currentExpState() {
    const report = window.AURELIX?.getReport?.();
    const liveExp = nullableNumber(state.liveResources.exp);
    const liveExpMax = nullableNumber(state.liveResources.expMax);
    const liveLevel = nullableNumber(state.liveResources.level);
    const exp = liveExp ?? nullableNumber(report?.resources?.player?.exp);
    const expMax = liveExpMax ?? nullableNumber(report?.resources?.player?.expMax);
    const level = liveLevel ?? nullableNumber(report?.resources?.player?.level);
    return {
      exp: Number.isFinite(exp) ? Math.max(0, exp) : null,
      expMax: Number.isFinite(expMax) ? Math.max(0, expMax) : null,
      level: Number.isFinite(level) ? Math.max(0, Math.floor(level)) : null
    };
  }
  async function fetchFreshPlayerState() {
    try {
      const { res, text } = await fetchText('/inventory.php', { signal: state.abortController?.signal });
      if (!res.ok) return null;
      const doc = docFromHtml(text);
      updateLiveResourcesFromDocument(doc);
      const xp = currentExpState();
      const stamina = currentStamina();
      const staminaMax = Number(state.liveResources.staminaMax ?? window.AURELIX?.getReport?.()?.resources?.player?.staminaMax);
      return {
        doc,
        level: xp.level,
        exp: xp.exp,
        expMax: xp.expMax,
        stamina,
        staminaMax: Number.isFinite(staminaMax) ? staminaMax : null
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return null;
    }
  }
  function smartLootThresholdState(playerState) {
    const exp = Number(playerState?.exp);
    const expMax = Number(playerState?.expMax);
    const thresholdPct = Math.min(99, Math.max(1, Number(state.settings.expThreshold) || 20));
    if (!Number.isFinite(exp) || !Number.isFinite(expMax) || expMax <= 0) {
      return { eligible: false, thresholdPct, thresholdAmount: null, remainingExp: null, exp: null, expMax: null };
    }
    const thresholdAmount = expMax * (thresholdPct / 100);
    const remainingExp = Math.max(0, expMax - exp);
    return {
      eligible: remainingExp <= thresholdAmount,
      thresholdPct,
      thresholdAmount,
      remainingExp,
      exp,
      expMax
    };
  }
  const AUTO_LOOT_STAMINA_TRIGGER = 10;
  function lootCardLooksJoined(card) {
    if (!card) return false;
    if (String(card.dataset?.unjoined || '') === '1') return false;
    if (String(card.dataset?.joined || '') === '1') return true;
    const text = normalizeSpace(card.textContent || '');
    return /\bjoined\b/i.test(text) && !/\bnot\s+joined\b/i.test(text);
  }
  function lootCardLooksDead(card) {
    if (!card) return false;
    if (String(card.dataset?.dead || '') === '1' || card.classList?.contains('dead')) return true;
    const text = normalizeSpace(card.textContent || '');
    const hp = parseResourcePair(text);
    return /\bdead\b|\bnot\s+looted\b|\bunclaimed\b/i.test(text) || (hp && hp.current <= 0);
  }
  function lootCardLooksUnclaimed(card) {
    if (!card) return false;
    if (String(card.dataset?.looted || '') === '1' || String(card.dataset?.claimed || '') === '1') return false;
    const text = normalizeSpace(card.textContent || '');
    if (/\balready\s+looted\b|\blooted\b|\bclaimed\b/i.test(text) && !/\bnot\s+looted\b|\bunclaimed\b/i.test(text)) return false;
    return true;
  }
  function lootCardName(card) {
    const named = card?.querySelector?.('.monster-name,.mon-name,.monster-title,.name,h1,h2,h3,h4,h5,strong');
    const value = normalizeSpace(named?.textContent || card?.dataset?.name || card?.dataset?.monsterName || '');
    return value || 'Monster';
  }
  function rewardUpToLevel(node) {
    const text = normalizeSpace(node?.textContent || node || '');
    const match = text.match(/\brewards?\s+(?:are\s+)?(?:available\s+)?(?:up\s*to|upto)\s*(?:level|lvl)?\s*[:#-]?\s*([\d,]+)/i)
      || text.match(/\brewards?\s+(?:are\s+)?(?:available\s+)?(?:up\s*to|upto)\s*[:#-]?\s*([\d,]+)\s*(?:level|lvl)\b/i);
    const value = match ? parseNumber(match[1]) : null;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  function candidateCanRewardExp(candidate, playerLevel) {
    const rawCap = candidate?.rewardUpToLevel;
    const cap = rawCap == null || rawCap === '' ? null : Number(rawCap);
    const level = Number(playerLevel);
    return !Number.isFinite(cap) || !Number.isFinite(level) || level <= cap;
  }
  function dungeonLootCandidateFromCard(card, loc) {
    // Boss cards do not consistently render a joined badge. The battle-page
    // verifier remains the authority before any loot claim is attempted.
    if (!lootCardLooksDead(card) || !lootCardLooksUnclaimed(card)) return null;
    const links = [...card.querySelectorAll('a[href],button[data-dgmid],button[data-monster-id],button[data-boss-id],[data-dgmid],[data-monster-id],[data-boss-id]')];
    let dgmid = parseNumber(card.dataset?.dgmid ?? card.dataset?.monsterId ?? card.dataset?.monster_id ?? card.dataset?.bossId ?? card.dataset?.boss_id);
    let instanceId = parseNumber(card.dataset?.instanceId ?? card.dataset?.instance_id) ?? parseNumber(loc.instanceId);
    let battleUrl = null;
    for (const node of links) {
      const rawHref = node.getAttribute?.('href') || '';
      if (rawHref) {
        try {
          const url = new URL(rawHref, window.location.origin);
          const id = parseNumber(url.searchParams.get('dgmid'));
          const inst = parseNumber(url.searchParams.get('instance_id'));
          if (id > 0) dgmid = id;
          if (inst > 0) instanceId = inst;
          if (/battle\.php/i.test(url.pathname) && id > 0) battleUrl = url.href;
        } catch (_) {}
      }
      const dataId = parseNumber(node.dataset?.dgmid ?? node.dataset?.monsterId ?? node.dataset?.monster_id ?? node.dataset?.bossId ?? node.dataset?.boss_id);
      if (dataId > 0) dgmid = dataId;
      const dataInst = parseNumber(node.dataset?.instanceId ?? node.dataset?.instance_id);
      if (dataInst > 0) instanceId = dataInst;
    }
    if (!(dgmid > 0) || !(instanceId > 0)) return null;
    if (!battleUrl) {
      const u = new URL('/battle.php', location.origin);
      u.searchParams.set('dgmid', String(dgmid));
      u.searchParams.set('instance_id', String(instanceId));
      battleUrl = u.href;
    }
    return {
      source: 'dungeon',
      name: lootCardName(card),
      instanceId,
      locationId: parseNumber(loc.locationId),
      dgmid,
      battleUrl,
      rewardUpToLevel: rewardUpToLevel(card),
      key: `dungeon:${instanceId}:${dgmid}`
    };
  }
  async function mapWithConcurrency(items, limit, worker) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const results = new Array(list.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(Number(limit) || 1, list.length)) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= list.length) return;
        results[index] = await worker(list[index], index);
      }
    });
    await Promise.all(runners);
    return results;
  }
  async function discoverDungeonLootCandidates() {
    const report = window.AURELIX?.getReport?.();
    const locations = Array.isArray(report?.dungeonLocations)
      ? report.dungeonLocations.filter(loc => loc?.url && Number(loc.instanceId) > 0)
      : [];
    if (!locations.length) return [];
    const batches = await mapWithConcurrency(locations, 4, async loc => {
      if (state.status !== ENGINE_STATES.RUNNING) return [];
      try {
        const { res, text } = await withGateDeadViewRequest(() => fetchText(loc.url, { signal: state.abortController?.signal }));
        if (!res.ok) return [];
        const doc = docFromHtml(text);
        updateLiveResourcesFromDocument(doc);
        const rawCards = [...doc.querySelectorAll('.mon,.monster-card,.boss-card,.dungeon-boss,[data-dgmid],[data-monster-id],[data-boss-id],a[href*="dgmid="]')];
        const cards = [...new Set(rawCards.map(node => node.closest?.('.mon,.monster-card,.boss-card,.dungeon-boss,[data-dgmid],[data-monster-id],[data-boss-id]') || node))];
        return cards
          .filter((card, index, all) => !all.some((other, otherIndex) => otherIndex < index && other.contains(card)))
          .map(card => dungeonLootCandidateFromCard(card, loc))
          .filter(Boolean);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return [];
      }
    });
    const seen = new Set();
    const out = [];
    for (const batch of batches) {
      for (const candidate of batch || []) {
        if (!candidate || seen.has(candidate.key)) continue;
        seen.add(candidate.key);
        out.push(candidate);
      }
    }
    return out;
  }
  function deadLootMaxPages(doc) {
    const batchCard = [...(doc?.querySelectorAll?.('.batch-loot-card') || [])]
      .find(card => /Dead\s+loot\s+page/i.test(card.textContent || ''));
    const match = String(batchCard?.textContent || '').match(/\/\s*(\d+)/);
    return Math.min(100, Math.max(1, match ? Number(match[1]) || 1 : 1));
  }
  function gateLootCandidateFromCard(card, wave) {
    if (!card || !lootCardLooksDead(card) || !lootCardLooksJoined(card) || !lootCardLooksUnclaimed(card)) return null;
    let monsterId = parseNumber(card.dataset?.monsterId ?? card.dataset?.monster_id ?? card.dataset?.mid ?? card.dataset?.id);
    let battleUrl = null;
    for (const node of card.querySelectorAll('a[href],[data-monster-id],[data-monster_id],[data-mid]')) {
      const rawHref = node.getAttribute?.('href') || '';
      if (rawHref) {
        try {
          const url = new URL(rawHref, location.origin);
          const fromId = parseNumber(url.searchParams.get('id') ?? url.searchParams.get('monster_id'));
          if (fromId > 0) monsterId = fromId;
          if (/battle\.php/i.test(url.pathname) && fromId > 0) battleUrl = url.href;
        } catch (_) {}
      }
      const dataId = parseNumber(node.dataset?.monsterId ?? node.dataset?.monster_id ?? node.dataset?.mid);
      if (dataId > 0) monsterId = dataId;
    }
    if (!(monsterId > 0)) return null;
    if (!battleUrl) {
      const u = new URL('/battle.php', location.origin);
      u.searchParams.set('id', String(monsterId));
      battleUrl = u.href;
    }
    return {
      source: 'gate',
      name: lootCardName(card),
      gateId: parseNumber(wave?.gateId),
      waveId: parseNumber(wave?.waveId),
      monsterId,
      battleUrl,
      rewardUpToLevel: rewardUpToLevel(card),
      key: `gate:${monsterId}`
    };
  }
  function engineSharedGateCookieMutex() {
    const key = '__AURELIX_GATE_COOKIE_MUTEX__';
    if (!window[key] || typeof window[key] !== 'object') {
      window[key] = { tail: Promise.resolve() };
    }
    return window[key];
  }
  async function withEngineGateCookieLock(fn) {
    const mutex = engineSharedGateCookieMutex();
    const task = Promise.resolve(mutex.tail).then(fn, fn);
    mutex.tail = task.then(() => undefined, () => undefined);
    return await task;
  }
  async function withGateDeadViewRequest(requestFn) {
    if (typeof requestFn !== 'function') throw new TypeError('withGateDeadViewRequest requires a request function.');
    return await withEngineGateCookieLock(async () => {
      const cookieNames = ['hide_dead_monsters', 'show_dead_bosses_only'];
      const original = new Map(cookieNames.map(name => [name, readCookie(name)]));
      const setCookie = (name, value) => {
        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}; Path=/; SameSite=Lax`;
      };
      const restoreCookie = name => {
        const value = original.get(name);
        if (value === '') document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`;
        else setCookie(name, value);
      };
      try {
        setCookie('hide_dead_monsters', '0');
        setCookie('show_dead_bosses_only', '0');
        return await requestFn();
      } finally {
        for (const name of cookieNames) restoreCookie(name);
      }
    });
  }
  async function discoverGateLootCandidates() {
    const report = window.AURELIX?.getReport?.();
    const waves = Array.isArray(report?.gateTopology?.waves) ? report.gateTopology.waves : [];
    const seen = new Set();
    const out = [];
    for (const wave of waves) {
        if (state.status !== ENGINE_STATES.RUNNING) break;
        if (!wave?.url) continue;
        let page = 1;
        let maxPages = 1;
        while (page <= maxPages && state.status === ENGINE_STATES.RUNNING) {
          try {
            const u = new URL(wave.url, location.origin);
            u.searchParams.set('dead_page', String(page));
            u.searchParams.set('_aurelix_loot', String(Date.now()));
            const { res, text } = await withGateDeadViewRequest(() => fetchText(u.href, {
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              signal: state.abortController?.signal
            }));
            if (res.status === 429) {
              const retry = Number(res.headers.get('Retry-After'));
              await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 3000);
              break;
            }
            if (!res.ok) break;
            const doc = docFromHtml(text);
            updateLiveResourcesFromDocument(doc);
            maxPages = Math.max(maxPages, deadLootMaxPages(doc));
            for (const card of doc.querySelectorAll('.monster-card[data-dead="1"],.monster-card,.mon.dead,.mon')) {
              const candidate = gateLootCandidateFromCard(card, wave);
              if (!candidate || seen.has(candidate.key)) continue;
              seen.add(candidate.key);
              out.push(candidate);
            }
            page += 1;
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            pushLog('warning', `AUTO LOOT — Gate loot discovery failed for Gate ${wave?.gateId ?? '?'} / Wave ${wave?.waveId ?? '?'}: ${error?.message || error}`);
            break;
          }
      }
    }
    return out;
  }
  function lootButtonAvailable(doc) {
    const btn = doc?.querySelector?.('#loot-button,[data-action="loot"],button[class*="loot"],a[class*="loot"]');
    if (!btn) return false;
    const text = normalizeSpace(btn.textContent || '');
    return !btn.disabled && !/\blooted\b|\bclaimed\b/i.test(text);
  }
  async function verifyLootCandidate(candidate) {
    try {
      const { res, text } = await fetchText(candidate.battleUrl, { signal: state.abortController?.signal });
      if (!res.ok) return null;
      const doc = docFromHtml(text);
      updateLiveResourcesFromDocument(doc);
      const bodyText = normalizeSpace(doc.body?.textContent || '');
      if (/\bnot\s+joined\b/i.test(bodyText) && !/\bjoined\b/i.test(bodyText.replace(/\bnot\s+joined\b/ig, ''))) return null;
      const lootEvidence = lootButtonAvailable(doc) || /\bnot\s+looted\b|\bunclaimed\b|\bloot\s+available\b/i.test(bodyText);
      if (!lootEvidence) return null;
      const cfg = parseBattleCfg(doc);
      if (candidate.source === 'dungeon') {
        if (!cfg.isDungeon || !(cfg.instanceId > 0) || !(cfg.dgmid > 0)) return null;
        if (Number(cfg.instanceId) !== Number(candidate.instanceId) || Number(cfg.dgmid) !== Number(candidate.dgmid)) return null;
      } else {
        if (cfg.isDungeon || !(cfg.id > 0) || Number(cfg.id) !== Number(candidate.monsterId)) return null;
      }
      const userId = parseUserId(doc);
      if (!userId) return null;
      return { doc, cfg, userId, rewardUpToLevel: rewardUpToLevel(doc.body) };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return null;
    }
  }
  function extractLootExp(data, text) {
    const candidates = [
      data?.exp,
      data?.exp_gained,
      data?.xp,
      data?.xp_gained,
      data?.summary?.exp,
      data?.rewards?.exp
    ];
    for (const value of candidates) {
      const n = parseNumber(value);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    const m = String(text || '').match(/(?:EXP|XP)\s*(?:gained|earned)?\s*[:+]\s*([\d,]+)/i);
    return m ? Math.max(0, parseNumber(m[1]) || 0) : 0;
  }
  async function claimOneLoot(candidate, { requireExpEligible = false, playerLevel = null } = {}) {
    const verified = await verifyLootCandidate(candidate);
    if (!verified) {
      pushLog('loot', `AUTO LOOT — skipped ${candidate.source} ${candidate.name}: fresh battle page did not confirm joined + dead + unclaimed loot.`);
      return { ok: false, reason: 'not-lootable' };
    }
    const verifiedCap = verified.rewardUpToLevel == null || verified.rewardUpToLevel === '' ? null : Number(verified.rewardUpToLevel);
    const listedCap = candidate.rewardUpToLevel == null || candidate.rewardUpToLevel === '' ? null : Number(candidate.rewardUpToLevel);
    const rewardCap = Number.isFinite(verifiedCap) ? verifiedCap : (Number.isFinite(listedCap) ? listedCap : null);
    const level = Number(playerLevel);
    if (requireExpEligible && Number.isFinite(rewardCap) && Number.isFinite(level) && level > rewardCap) {
      return { ok:false, reason:'reward-capped', rewardCap };
    }
    const body = new URLSearchParams();
    if (candidate.source === 'dungeon') {
      body.set('instance_id', String(verified.cfg.instanceId));
      body.set('dgmid', String(verified.cfg.dgmid));
    } else {
      body.set('monster_id', String(verified.cfg.id));
    }
    body.set('user_id', String(verified.userId));
    const endpoint = candidate.source === 'dungeon' ? '/dungeon_loot.php' : '/loot.php';
    const { res, text } = await fetchText(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body.toString(),
      signal: state.abortController?.signal
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After'));
      await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 3000);
      return { ok: false, reason: 'rate-limit' };
    }
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    const message = normalizeSpace(data?.message || data?.error || text);
    const explicitSuccess = data
      ? (data.status === 'success' || data.ok === true || data.success === true)
      : /success|loot(?:ed| claimed)|reward/i.test(message);
    const explicitFailure = /not\s+joined|already\s+(?:looted|claimed)|invalid|failed|cannot\s+loot|can't\s+loot|not\s+eligible/i.test(message);
    const ok = res.ok && !explicitFailure && (explicitSuccess || !message || candidate.source === 'gate');
    if (!ok) {
      pushLog('warning', `AUTO LOOT — server rejected ${candidate.source} ${candidate.name}: ${message || `HTTP ${res.status}`}.`);
      return { ok: false, reason: 'rejected', message };
    }
    const expGained = extractLootExp(data, text);
    state.session.stats.xpLooted += expGained;
    state.session.stats.mobsLooted += 1;
    state.session.stats.mobsUnlooted = Math.max(0, Number(state.session.stats.mobsUnlooted || 0) - 1);
    pushLog('loot', `🎁 AUTO LOOT — ${candidate.source === 'dungeon' ? 'Dungeon' : 'Gate'}: ${candidate.name}${expGained > 0 ? ` (+${Math.round(expGained).toLocaleString()} EXP)` : ''}.`);
    emit();
    return { ok: true, expGained };
  }
  async function processLootCandidates(candidates, { stopOnRecovery = false, initialLevel = null, initialStamina = null, reserveOne = true } = {}) {
    const level = Number(initialLevel || currentExpState().level);
    let queue = Array.isArray(candidates) ? [...candidates] : [];
    if (!stopOnRecovery && reserveOne) {
      const reservable = queue.filter(candidate => candidate.rewardUpToLevel != null && candidate.rewardUpToLevel !== '' && Number.isFinite(Number(candidate.rewardUpToLevel)) && candidateCanRewardExp(candidate, level));
      const unknownCap = queue.filter(candidate => candidate.rewardUpToLevel == null || candidate.rewardUpToLevel === '');
      const reserve = reservable[reservable.length - 1] || unknownCap[unknownCap.length - 1] || null;
      if (reserve) {
        queue = queue.filter(candidate => candidate.key !== reserve.key);
        const verifiedLabel = reservable.includes(reserve) ? 'level-eligible' : 'potential';
        pushLog('loot', `AUTO LOOT — reserved ${reserve.name} as one ${verifiedLabel} EXP loot for emergency stamina recovery.`);
      }
    }
    const attempted = new Set();
    let claimedAny = false;
    let rewardCapped = 0;
    for (const candidate of queue) {
      if (state.status !== ENGINE_STATES.RUNNING) break;
      if (attempted.has(candidate.key)) continue;
      attempted.add(candidate.key);
      const result = await claimOneLoot(candidate, { requireExpEligible:stopOnRecovery, playerLevel:level });
      if (result.reason === 'reward-capped') {
        rewardCapped += 1;
        continue;
      }
      if (!result.ok) continue;
      claimedAny = true;
      if (!stopOnRecovery) {
        await sleep(20);
        continue;
      }
      await sleep(40);
      const after = await fetchFreshPlayerState();
      if (after) {
        if (Number(after.level) > Number(initialLevel || 0)) {
          if (!(after.stamina > 0) && Number.isFinite(after.staminaMax) && after.staminaMax > 0) state.liveResources.stamina = after.staminaMax;
          pushLog('success', `🎉 AUTO LOOT — LEVEL UP${initialLevel ? ` ${initialLevel} → ${after.level}` : ` → ${after.level}`}.`);
          emit();
          return 'recovered';
        }
        if (Number(after.stamina) > Math.max(0, Number(initialStamina) || 0)) {
          pushLog('success', '🎉 AUTO LOOT — stamina restored by loot; loot stopped immediately.');
          emit();
          return 'recovered';
        }
      }
      await sleep(20);
    }
    if (stopOnRecovery && rewardCapped > 0) {
      pushLog('loot', `AUTO LOOT — ${rewardCapped} monster${rewardCapped === 1 ? '' : 's'} had an explicitly verified reward cap below level ${level}; unknown-cap monsters were still checked normally.`);
    }
    return claimedAny ? 'claimed' : 'none';
  }
  async function tryPriorityDungeonLoot({ stopOnRecovery = false, force = false } = {}) {
    if (state.status !== ENGINE_STATES.RUNNING || state.settings.autoLoot === false) return false;
    if (state.lootInFlight) return false;
    const now = Date.now();
    if (!force && now - Number(state.lastDungeonLootSweepAt || 0) < 8000) return false;
    state.lootInFlight = true;
    state.lastDungeonLootSweepAt = now;
    try {
      const fresh = await fetchFreshPlayerState();
      const initialLevel = Number(fresh?.level) || null;
      pushLog('loot', 'AUTO LOOT — Dungeon priority sweep.');
      const dungeonCandidates = await discoverDungeonLootCandidates();
      state.session.stats.mobsUnlooted = new Set(dungeonCandidates.map(x => x.key)).size;
      emit();
      if (!dungeonCandidates.length) return false;
      pushLog('loot', `AUTO LOOT — ${dungeonCandidates.length} dead + unclaimed Dungeon candidate${dungeonCandidates.length === 1 ? '' : 's'} found; verifying and claiming Dungeon loot first.`);
      // Dungeon bosses are explicit priority loot: never reserve one of them.
      // The emergency reserve is maintained by the Gate/Wave loot pool instead.
      const result = await processLootCandidates(dungeonCandidates, { stopOnRecovery, initialLevel, initialStamina:fresh?.stamina, reserveOne:false });
      if (result === 'recovered') return 'recovered';
      if (result === 'claimed') return 'claimed';
      return false;
    } finally {
      state.lootInFlight = false;
      state.dungeonLootSweepPending = false;
    }
  }
  async function runPendingDungeonLootSweep() {
    if (!state.dungeonLootSweepPending || state.settings.autoLoot === false || state.status !== ENGINE_STATES.RUNNING) return false;
    if (state.attackInFlight || state.potionInFlight || state.lootInFlight) return false;
    if (state.dungeonLootSweepPromise) return state.dungeonLootSweepPromise;
    state.dungeonLootSweepPromise = tryPriorityDungeonLoot({ force: true }).finally(() => { state.dungeonLootSweepPromise = null; });
    return state.dungeonLootSweepPromise;
  }
  async function trySmartAutoLoot() {
    if (state.lootInFlight || state.status !== ENGINE_STATES.RUNNING || state.settings.autoLoot === false) return false;
    const startingStamina = currentStamina();
    if (Number.isFinite(startingStamina) && startingStamina >= AUTO_LOOT_STAMINA_TRIGGER) return false;

    // Dungeon loot is always the first recovery source. This pass is not blocked by
    // the Gate EXP threshold because Dungeon priority is an explicit user policy.
    const dungeonResult = await tryPriorityDungeonLoot({ stopOnRecovery: true, force: true });
    if (dungeonResult === 'recovered' || Number(currentStamina()) >= AUTO_LOOT_STAMINA_TRIGGER) return true;

    const fresh = await fetchFreshPlayerState();
    if (!fresh) {
      pushLog('warning', 'AUTO LOOT — could not verify fresh EXP/Level after Dungeon sweep; falling back to stamina potion.');
      return false;
    }
    const threshold = smartLootThresholdState(fresh);
    if (!threshold.eligible) {
      if (Number.isFinite(threshold.exp) && Number.isFinite(threshold.thresholdAmount)) {
        pushLog('loot', `AUTO LOOT — Dungeon sweep complete; ${Math.round(threshold.remainingExp).toLocaleString()} EXP remains, above the ${threshold.thresholdPct}% Gate recovery window (${Math.round(threshold.thresholdAmount).toLocaleString()}); using stamina potion.`);
      }
      return false;
    }
    const initialLevel = Number(fresh.level);
    if (!(initialLevel > 0)) {
      pushLog('warning', 'AUTO LOOT — player level could not be verified; falling back to stamina potion.');
      return false;
    }
    state.lootInFlight = true;
    try {
      pushLog('loot', `🎁 AUTO LOOT — Gate recovery pass: Stamina ${Math.max(0, Math.round(Number(currentStamina()) || 0))} (<${AUTO_LOOT_STAMINA_TRIGGER}) and ${Math.round(threshold.remainingExp).toLocaleString()} EXP remains inside the ${threshold.thresholdPct}% window.`);
      const gateCandidates = await discoverGateLootCandidates();
      state.session.stats.mobsUnlooted = new Set(gateCandidates.map(x => x.key)).size;
      emit();
      if (!gateCandidates.length) {
        pushLog('loot', 'AUTO LOOT — no eligible Gate/Wave loot found after Dungeon priority pass.');
        return false;
      }
      pushLog('loot', `AUTO LOOT — ${gateCandidates.length} joined + dead + unclaimed Gate candidate${gateCandidates.length === 1 ? '' : 's'} found.`);
      const result = await processLootCandidates(gateCandidates, { stopOnRecovery: true, initialLevel, initialStamina:fresh.stamina });
      if (result === 'recovered') return true;
      pushLog('warning', 'AUTO LOOT — eligible Gate loot exhausted without stamina recovery; falling back to selected stamina potion.');
      return false;
    } finally {
      state.lootInFlight = false;
    }
  }
  function directSkillModelKey(target, skill) {
    const encounter = runtimeEncounterKey(target);
    const skillKey = skill?.key || activeSkillKey(skill) || 'unknown-skill';
    return `${encounter}|${skillKey}`;
  }
  function resetDirectSkillModels(target) {
    const prefix = `${runtimeEncounterKey(target)}|`;
    for (const key of [...state.skillDamageModels.keys()]) {
      if (String(key).startsWith(prefix)) state.skillDamageModels.delete(key);
    }
  }
  function getSkillDamageModel(target, skill) {
    const key = directSkillModelKey(target, skill);
    if (!state.skillDamageModels.has(key)) state.skillDamageModels.set(key, { samples: 0, averageDamage: 0 });
    return state.skillDamageModels.get(key);
  }
  function observeDirectSkillDamage(target, skill, damage) {
    const value = Number(damage);
    if (!(value > 0)) return;
    const model = getSkillDamageModel(target, skill);
    model.averageDamage = model.samples > 0 ? Math.max(model.averageDamage, value) : value;
    model.samples += 1;
  }
  function directSkillSafeForBudget(target, skill, remaining, limit) {
    const model = getSkillDamageModel(target, skill);
    const tolerance = Math.max(0, Number(limit) * Math.max(0, Number(state.settings.softOvershootPct) || 0));
    if (model.samples > 0 && model.averageDamage > 0) return model.averageDamage <= remaining + tolerance;
    return remaining >= Math.max(1, Number(limit) * 0.25);
  }
  function activeSkillDiscoveryCandidates(report = window.AURELIX?.getReport?.()) {
    const entities = Array.isArray(report?.entities) ? report.entities : [];
    const out = [];
    const seen = new Set();
    const add = target => {
      if (!target) return;
      const hp = Number(target?.hp?.current ?? target?.currentHp);
      const alive = target?.status === 'alive' || hp > 0;
      if (!alive && target !== state.currentTarget) return;
      let url = null;
      try {
        const runtimeId = target?.runtimeId ?? target?.monsterId ?? target?.dgmid;
        if (!target?.battleUrl && runtimeId == null) return;
        url = battleUrlFor(target);
      } catch (_) { return; }
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ target, url });
    };
    add(state.currentTarget);
    entities.filter(e => e?.targetEligible && (e?.status === 'alive' || Number(e?.hp?.current ?? e?.currentHp) > 0)).forEach(add);
    entities.filter(e => e?.source === 'dungeon' && (e?.status === 'alive' || Number(e?.hp?.current ?? e?.currentHp) > 0)).forEach(add);
    entities.filter(e => e?.source === 'gate' && (e?.status === 'alive' || Number(e?.hp?.current ?? e?.currentHp) > 0)).forEach(add);
    return out.slice(0, 12);
  }
  async function joinDiscoveryBattleWithoutAttack(candidate, doc) {
    if (!candidate?.target || !doc?.querySelector) return false;
    if (!doc.querySelector('#join-battle')) return false;
    const userId = parseUserId(doc);
    if (!userId) return false;
    const target = candidate.target;
    const body = new URLSearchParams();
    if (target.source === 'dungeon') {
      body.set('instance_id', String(target.instanceId));
      body.set('dgmid', String(target.dgmid ?? target.runtimeId));
    } else {
      body.set('monster_id', String(target.monsterId ?? target.runtimeId));
    }
    body.set('user_id', String(userId));
    const endpoint = target.source === 'dungeon' ? '/dungeon_join_battle.php' : '/user_join_battle.php';
    const { res, text } = await fetchText(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: state.abortController?.signal
    });
    const msg = normalizeSpace(text);
    const ok = res.ok && (/^you have successfully/i.test(msg) || /already\s+joined/i.test(msg) || /success/i.test(msg));
    if (ok) pushLog('system', `Joined ${target.name || 'a live battle'} only to discover Active Skills; no attack was sent.`);
    return ok;
  }
  async function refreshActiveSkills(force = false) {
    const now = Date.now();
    if (!force && state.skillDiscoveryAt && now - state.skillDiscoveryAt < 60_000 && Object.keys(state.skillCatalog).length) return getActiveSkills();
    if (state.skillDiscoveryPromise) return state.skillDiscoveryPromise;
    state.skillDiscoveryPromise = (async () => {
      try {
        const report = window.AURELIX?.getReport?.();
        const candidates = activeSkillDiscoveryCandidates(report);
        if (!candidates.length) {
          state.skillDiscoveryAt = 0;
          return getActiveSkills();
        }
        let checked = 0;
        const joinable = [];
        for (const candidate of candidates) {
          checked += 1;
          try {
            const { res, text } = await fetchText(candidate.url, { signal: state.abortController?.signal });
            if (!res.ok) continue;
            const doc = docFromHtml(text);
            const discovered = updateSkillCatalogFromDocument(doc);
            if (discovered.length) {
              state.skillDiscoveryAt = Date.now();
              pushLog('system', `Active Skills discovered automatically (${discovered.length}) from live battle state.`);
              emit();
              return getActiveSkills();
            }
            if (doc.querySelector('#join-battle') && parseUserId(doc)) joinable.push({ candidate, doc });
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
          }
        }
        if (joinable.length) {
          const normalFirst = joinable.sort((a, b) => {
            const aa = a.candidate.target?.targetEligible ? 1 : 0;
            const bb = b.candidate.target?.targetEligible ? 1 : 0;
            return aa - bb;
          });
          const pick = normalFirst[Math.floor(Math.random() * Math.min(3, normalFirst.length))] || normalFirst[0];
          try {
            if (await joinDiscoveryBattleWithoutAttack(pick.candidate, pick.doc)) {
              await sleep(120);
              const { res, text } = await fetchText(pick.candidate.url, { signal: state.abortController?.signal });
              if (res.ok) {
                const discovered = updateSkillCatalogFromDocument(docFromHtml(text));
                if (discovered.length) {
                  state.skillDiscoveryAt = Date.now();
                  pushLog('system', `Active Skills discovered automatically (${discovered.length}) after joining a discovery battle.`);
                  emit();
                  return getActiveSkills();
                }
              }
            }
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
          }
        }
        state.skillDiscoveryAt = 0;
        pushLog('warning', `Active Skill discovery checked ${checked} live battle page${checked === 1 ? '' : 's'}${joinable.length ? ' and attempted a join-only discovery battle' : ''} but found no actionable skills.`);
        return getActiveSkills();
      } catch (error) {
        if (error?.name !== 'AbortError') pushLog('warning', `Active skill discovery failed: ${error?.message || error}`);
        return getActiveSkills();
      } finally {
        state.skillDiscoveryPromise = null;
      }
    })();
    return state.skillDiscoveryPromise;
  }
  const MANA_POTION_TRIGGER = 20;
  function manaPotionTriggerReached(value = currentMana()) {
    const mana = Number(value);
    return Number.isFinite(mana) && mana <= MANA_POTION_TRIGGER;
  }
  async function ensureManaForSkill(target, skill) {
    const required = Math.max(0, Number(skill?.manaCost) || 0);
    if (!(required > 0)) return true;
    let mana = currentMana();
    let manaMax = Number(state.liveResources.manaMax);
    if (!Number.isFinite(mana) || !(manaMax > 0)) {
      try {
        const snap = await fetchBattleSnapshot(target);
        if (snap?.playerMana && Number.isFinite(Number(snap.playerMana.current))) {
          mana = Number(snap.playerMana.current);
          state.liveResources.mana = mana;
        }
        if (snap?.playerMana && Number(snap.playerMana.max) > 0) {
          manaMax = Number(snap.playerMana.max);
          state.liveResources.manaMax = manaMax;
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
      }
    }
    if (Number.isFinite(mana) && mana >= required) return true;
    if (!manaPotionTriggerReached(mana)) {
      if (Number.isFinite(mana)) pushLog('mana', `${skill.name} skipped at ${Math.round(mana)} MP; Auto Mana waits until ${MANA_POTION_TRIGGER} MP or lower.`);
      return false;
    }
    if (!selectedPotion('mana')) {
      pushLog('warning', `${skill.name} needs ${required} MP; no usable selected Mana potion is available.`);
      return false;
    }
    const used = await useEmergencyPotion('mana', { fillToMax: true });
    if (!used) return false;
    await sleep(120);
    mana = currentMana();
    return Number.isFinite(Number(mana)) && Number(mana) >= required;
  }
  function confirmSupportSkillActivation(skill, data, message = '') {
    if (!skill || !data || (data.status && data.status !== 'success')) return false;
    const skillName = normalizeName(skill.name || '');
    const cleanMessage = normalizeName(String(message || '').replace(/<[^>]*>/g, ' '));
    const logs = Array.isArray(data.logs) ? data.logs : [];
    const matchingLog = logs.find(log => normalizeName(log?.SKILL_NAME || '') === skillName);
    if (matchingLog) {
      const damage = parseNumber(matchingLog.DAMAGE);
      const extra = normalizeName(matchingLog.EXTRA_INFO || '');
      if ((damage == null || damage === 0) && /support\s+skill|no\s+direct\s+damage|buff|transfer|activated|applied/.test(extra)) return true;
      if (damage === 0) return true;
    }
    return !!skillName && cleanMessage.includes(skillName) && /support\s+skill|no\s+direct\s+damage|buff|activated|applied|you\s+used/.test(cleanMessage);
  }
  function rememberSkillAsBuff(skill) {
    if (!skill) return;
    skill.behavior = 'buff';
    const key = skill.key || activeSkillKey(skill);
    if (key && state.skillCatalog[key]) {
      state.skillCatalog[key] = { ...state.skillCatalog[key], behavior:'buff', learnedBehavior:true, updatedAt:new Date().toISOString() };
      saveObject(ENGINE_STORE.skillCatalog, state.skillCatalog);
    }
  }
  async function performActiveSkill(target, damageBefore, skill, allowManaRetry = true) {
    if (!skill || state.attackInFlight) return { ok: false, reason: 'attack-locked', damage: damageBefore };
    state.attackInFlight = true;
    try {
      const preflight = await combatPreflight(target);
      if (!preflight.ok || !preflight.identityOk) return { ok: false, reason: 'stale-target', damage: damageBefore };
      if (preflight.phaseDuel) return { ok: false, reason: 'phase-duel', phase: preflight.phaseDuel, damage: damageBefore };
      const verified = await authoritativeDamage(target, preflight);
      if (Number.isFinite(verified)) damageBefore = Math.max(damageBefore, verified);
      const remaining = target.damageLimit - damageBefore;
      if (!(remaining > 0)) return { ok: true, done: true, damage: damageBefore };
      if (skill.behavior === 'direct' && !directSkillSafeForBudget(target, skill, remaining, target.damageLimit)) {
        pushLog('skill', `${skill.name} skipped near damage limit; Adaptive Slash will finish safely.`);
        return { ok: true, skippedForLimit: true, damage: damageBefore };
      }
      if (skill.staminaDisplayCost > 0 && Number(currentStamina()) < Number(skill.staminaDisplayCost)) {
        pushLog('skill', `${skill.name} waiting for ${skill.staminaDisplayCost.toLocaleString()} stamina; using Adaptive Slash instead.`);
        return { ok: true, skippedForStamina: true, damage: damageBefore };
      }
      if (!await ensureManaForSkill(target, skill)) return { ok: true, skippedForMana: true, damage: damageBefore };
      if (skill.behavior === 'buff' && target.source === 'gate' && preflight.divine) {
        return await performRelayedBuff(target, skill, damageBefore);
      }
      const beforeStamina = Number(currentStamina());
      const body = new URLSearchParams();
      if (target.source === 'dungeon') {
        body.set('instance_id', String(target.instanceId));
        body.set('dgmid', String(target.dgmid ?? target.runtimeId));
      } else body.set('monster_id', String(target.monsterId ?? target.runtimeId));
      body.set('skill_id', String(skill.skillId));
      body.set('stamina_cost', String(skill.requestStaminaCost ?? 1));
      const { res, text } = await fetchText('/damage.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: state.abortController?.signal
      });
      if (res.status === 429) {
        invalidateCombatPreflight(target);
        const retryAfter = Number(res.headers.get('Retry-After'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000);
        return { ok: true, cooldownOnly: true, damage: damageBefore };
      }
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}
      const message = normalizeSpace(data?.message || data?.error || text);
      if (!res.ok || !data || (data.status && data.status !== 'success')) {
        if (/not enough mana/i.test(message)) {
          const manaNow = currentMana();
          if (allowManaRetry && manaPotionTriggerReached(manaNow) && await useEmergencyPotion('mana', { fillToMax: true })) {
            await sleep(120);
            pushLog('mana', `Mana recovered for ${skill.name}; retrying on the next combat cycle.`);
            return { ok: true, cooldownOnly: true, damage: damageBefore };
          }
          if (Number.isFinite(Number(manaNow))) pushLog('mana', `${skill.name} skipped at ${Math.round(Number(manaNow))} MP; Auto Mana waits until ${MANA_POTION_TRIGGER} MP or lower.`);
          return { ok: true, skippedForMana: true, damage: damageBefore };
        }
        if (/pvp\s*duel\s*phase|entered\s+a\s+pvp\s+duel\s+phase|defeat\s+that\s+form/i.test(message)) {
          const phaseSnapshot = await combatPreflight(target, true);
          if (phaseSnapshot.phaseDuel) return { ok: false, reason: 'phase-duel', phase: phaseSnapshot.phaseDuel, damage: damageBefore };
        }
        if (/quickly|too\s*fast|slow\s*down|wait|cooldown/i.test(message)) {
          invalidateCombatPreflight(target);
          await sleep(2000);
          return { ok: true, cooldownOnly: true, damage: damageBefore };
        }
        if (/already\s*dead|monster\s*is\s*already\s*dead/i.test(message)) return { ok: false, reason: 'dead', damage: damageBefore };
        if (skill.behavior === 'buff' && target.source === 'gate' && /divine|shield|(?:cannot|can't|can not).{0,40}(?:buff|skill)|(?:buff|skill).{0,40}(?:not allowed|blocked|restricted)/i.test(message)) {
          pushLog('skill', `${skill.name} is restricted on ${target.name}; switching to normal-mob buff relay.`);
          return await performRelayedBuff(target, skill, damageBefore);
        }
        pushLog('warning', `${skill.name} rejected on ${target.name}: ${message || `HTTP ${res.status}`}`);
        return { ok: false, reason: 'rejected', damage: damageBefore };
      }
      let cumulative = damageBefore;
      let hit = 0;
      if (skill.behavior === 'direct' && confirmSupportSkillActivation(skill, data, message)) {
        rememberSkillAsBuff(skill);
        pushLog('system', `${skill.name} identified as an activation/buff skill; it will no longer be treated as direct damage.`);
      }
      if (skill.behavior === 'buff') {
        if (!confirmSupportSkillActivation(skill, data, message)) {
          pushLog('warning', `${skill.name} returned success but its support activation could not be confirmed; combat paused for safety.`);
          return { ok: false, reason: 'unconfirmed-buff', damage: damageBefore };
        }
      } else {
        const authoritative = await requireAuthoritativeAttackTotal(target, damageBefore, data, skill.name);
        if (!authoritative.ok) return { ok: false, uncertain: true, damage: authoritative.total, reason: authoritative.reason };
        cumulative = authoritative.total;
        hit = Math.max(0, cumulative - damageBefore);
      }
      const afterStamina = parseNumber(data.stamina);
      const afterMana = parseNumber(data.mana);
      if (Number.isFinite(afterStamina)) state.liveResources.stamina = afterStamina;
      if (Number.isFinite(afterMana)) state.liveResources.mana = afterMana;
      if (data.retaliation?.user_hp_after != null) state.liveResources.hp = Number(data.retaliation.user_hp_after);
      updateLiveExpFromAttack(data);
      const spentStamina = Number.isFinite(beforeStamina) && Number.isFinite(afterStamina) ? Math.max(0, beforeStamina - afterStamina) : Math.max(0, Number(skill.staminaDisplayCost) || 0);
      state.session.stats.attacks += 1;
      state.session.stats.damage += Math.max(0, hit);
      state.session.stats.staminaUsed += spentStamina;
      const markEffect = skill.behavior === 'direct' ? updateMarkStateFromResponse(target, data) : { active: markTurns(target) > 0, reduced: false, turns: markTurns(target), applied: false };
      if (skill.behavior === 'direct' && hit > 0 && !markEffect.reduced) observeDirectSkillDamage(target, skill, hit);
      if (data?.phase?.changed === true) {
        invalidateCombatPreflight(target);
        resetSlashModel(target, 'server phase changed');
        resetDirectSkillModels(target);
        state.markTurnsByEncounter[markStateKey(target)] = 0;
      }
      const skillMarkPrefix = skill.behavior === 'direct'
        ? (markEffect.applied ? `🌙 Mark ${markEffect.turns}/${markEffect.total} • ` : markEffect.cleared ? '🌙 Mark cleared • ' : (markEffect.active && markEffect.total > 0 ? `🌙 Mark ${markEffect.turns}/${markEffect.total} • ` : ''))
        : '';
      pushLog('skill', `${skillMarkPrefix}${skill.behavior === 'buff' ? '✨' : '🔥'} ${skill.name} → ${target.name}${hit > 0 ? `: +${Math.round(hit).toLocaleString()} DMG` : ': activated'} | ${Math.round(cumulative).toLocaleString()}/${Math.round(target.damageLimit).toLocaleString()}`);
      emit();
      noteCombatAction(target);
      await sleep(state.settings.attackCooldownMs);
      return { ok: true, damage: cumulative, hit, skill };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      pushLog('warning', `${skill.name} result uncertain; verifying damage before continuing.`);
      const resolved = await resolveUncertainAttack(target, damageBefore);
      return { ok: resolved.resolved, uncertain: true, damage: resolved.damage, reason: resolved.resolved ? null : 'unresolved-network' };
    } finally {
      state.attackInFlight = false;
    }
  }
  async function handleZeroResourceOnce() {
    const hp = currentHp();
    if (Number.isFinite(hp) && hp <= 0) {
      return await useEmergencyPotion('hp');
    }
    const stamina = currentStamina();
    if (Number.isFinite(stamina) && stamina <= 0) {
      let threshold = smartLootThresholdState(currentExpState());
      if (!Number.isFinite(threshold.remainingExp)) {
        const fresh = await fetchFreshPlayerState();
        threshold = smartLootThresholdState(fresh);
      }
      if (threshold.eligible && state.settings.autoLoot !== false) {
        const lootedToRecovery = await trySmartAutoLoot();
        if (lootedToRecovery === true) return true;
        if (lootedToRecovery === 'hold') return false;
      }
      return false;
    }
    return false;
  }
  async function useOnePotionForPreferredSlash(target, damage, stamina, threshold) {
    if (!target || threshold?.eligible || !Number.isFinite(Number(threshold?.remainingExp))) return false;
    const model = getSlashModel(target);
    if (!(model.damagePerStamina > 0) || model.samples < 1) return false;
    const staminaMax = Number(state.liveResources.staminaMax ?? window.AURELIX?.getReport?.()?.resources?.player?.staminaMax);
    const refillCapacity = Number.isFinite(staminaMax) && staminaMax > 0
      ? Math.max(0, staminaMax)
      : 1000;
    const preferredSlash = model.choose({
      remainingDamage: target.damageLimit - damage,
      damageLimit: target.damageLimit,
      staminaAvailable: refillCapacity,
      softOvershootPct: state.settings.softOvershootPct
    });
    // Potions accelerate 50/100/200/1000-stamina attacks only. A 1- or
    // 10-stamina cleanup slash never justifies consuming a stamina potion.
    if (!preferredSlash || preferredSlash.stamina < 50 || preferredSlash.stamina <= Math.max(0, Number(stamina) || 0) || !selectedPotion('stamina')) return false;
    pushLog('stamina', `⚡ Single-potion refill — ${Math.max(0, Math.round(Number(stamina) || 0)).toLocaleString()} stamina cannot fund the damage-safe ${preferredSlash.name}; using one selected stamina potion.`);
    return await useEmergencyPotion('stamina', { targetStamina: preferredSlash.stamina });
  }
  function extractHitDamage(data, priorTotal) {
    const total = parseNumber(data?.totaldmgdealt);
    if (Number.isFinite(total) && total >= 0 && Number.isFinite(priorTotal)) return Math.max(0, total - priorTotal);
    const values = [
      data?.damage,
      data?.logs?.[0]?.DAMAGE_TO_MONSTERS,
      data?.logs?.[0]?.DAMAGE
    ];
    for (const v of values) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return 0;
  }
  function responseWasCritical(data) {
    const isTrueFlag = value => value === true || value === 1 || /^(?:1|true|yes)$/i.test(String(value ?? '').trim());
    if (isTrueFlag(data?.is_critical) || isTrueFlag(data?.is_crit) || isTrueFlag(data?.critical)) return true;
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    if (logs.some(log => isTrueFlag(log?.is_critical) || isTrueFlag(log?.is_crit) || isTrueFlag(log?.IS_CRITICAL) || isTrueFlag(log?.CRITICAL))) return true;
    const evidence = [
      data?.message,
      data?.critical_message,
      typeof data?.critical === 'string' ? data.critical : null,
      ...logs.flatMap(log => [log?.EXTRA_INFO, log?.MESSAGE, log?.RESULT, log?.TYPE])
    ].filter(value => value != null).join(' ');
    return /\bcritical(?:\s+hit)?\b|\bcrit\b/i.test(evidence);
  }
  async function resolveUncertainAttack(target, previousDamage) {
    await sleep(Math.max(700, state.settings.attackCooldownMs));
    const snapshot = await combatPreflight(target, true);
    if (!snapshot.ok || !snapshot.identityOk) return { resolved: false, damage: previousDamage };
    const observed = await authoritativeDamage(target, snapshot);
    if (Number.isFinite(observed)) {
      const finalDamage = Math.max(Number(previousDamage) || 0, observed);
      recordEncounterDamage(target, finalDamage);
      return { resolved: true, damage: finalDamage };
    }
    return { resolved: false, damage: previousDamage };
  }
  async function attackOnce(target, damageBefore, slash, forceExactSlash = false) {
    if (state.attackInFlight) return { ok: false, reason: 'attack-locked', damage: damageBefore };
    state.attackInFlight = true;
    try {
      const preflight = await combatPreflight(target);
      if (!preflight.ok || !preflight.identityOk) return { ok: false, reason: 'stale-target', damage: damageBefore };
      if (preflight.phaseDuel) return { ok: false, reason: 'phase-duel', phase: preflight.phaseDuel, damage: damageBefore };
      const verified = await authoritativeDamage(target, preflight);
      if (Number.isFinite(verified)) damageBefore = Math.max(damageBefore, verified);
      const remaining = target.damageLimit - damageBefore;
      if (!(remaining > 0)) return { ok: true, done: true, damage: damageBefore };
      const latestStamina = currentStamina();
      const slashModel = getSlashModel(target);
      if (forceExactSlash) {
        if (!slash || !(Number(slash.stamina) > 0) || Number(slash.stamina) > Number(latestStamina)) {
          return { ok: false, reason: 'no-stamina', damage: damageBefore };
        }
      } else {
        const finalSlash = slashModel.choose({
          remainingDamage: remaining,
          damageLimit: target.damageLimit,
          staminaAvailable: latestStamina,
          softOvershootPct: state.settings.softOvershootPct
        });
        if (!finalSlash) return { ok: false, reason: 'no-stamina', damage: damageBefore };
        slash = finalSlash;
      }
      const body = new URLSearchParams();
      if (target.source === 'dungeon') {
        body.set('instance_id', String(target.instanceId));
        body.set('dgmid', String(target.dgmid ?? target.runtimeId));
      } else {
        body.set('monster_id', String(target.monsterId ?? target.runtimeId));
      }
      body.set('skill_id', String(slash.skillId));
      body.set('stamina_cost', String(slash.stamina));
      let res, text;
      try {
        ({ res, text } = await fetchText('/damage.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: state.abortController?.signal
        }));
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        pushLog('warning', `Attack result uncertain for ${target.name}; verifying before any retry.`);
        const resolved = await resolveUncertainAttack(target, damageBefore);
        return { ok: resolved.resolved, uncertain: true, damage: resolved.damage, reason: resolved.resolved ? null : 'unresolved-network' };
      }
      if (res.status === 429) {
        invalidateCombatPreflight(target);
        const retryAfter = Number(res.headers.get('Retry-After'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000;
        pushLog('warning', `Rate limited by server; waiting ${Math.ceil(waitMs / 1000)}s.`);
        await sleep(waitMs);
        const resolved = await resolveUncertainAttack(target, damageBefore);
        return { ok: resolved.resolved, damage: resolved.damage, reason: resolved.resolved ? null : 'rate-limit' };
      }
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}
      const message = normalizeSpace(data?.message || data?.error || text);
      if (!res.ok || !data || (data.status && data.status !== 'success')) {
        if (/pvp\s*duel\s*phase|entered\s+a\s+pvp\s+duel\s+phase|defeat\s+that\s+form/i.test(message)) {
          const phaseSnapshot = await combatPreflight(target, true);
          if (phaseSnapshot.phaseDuel) return { ok: false, reason: 'phase-duel', phase: phaseSnapshot.phaseDuel, damage: damageBefore };
        }
        if (/quickly|too\s*fast|slow\s*down|wait|cooldown/i.test(message)) {
          invalidateCombatPreflight(target);
          await sleep(2000);
          return { ok: true, cooldownOnly: true, damage: damageBefore };
        }
        if (/already\s*dead|monster\s*is\s*already\s*dead/i.test(message)) return { ok: false, reason: 'dead', damage: damageBefore };
        pushLog('warning', `Attack rejected on ${target.name}: ${message || `HTTP ${res.status}`}`);
        return { ok: false, reason: 'rejected', damage: damageBefore };
      }
      const authoritative = await requireAuthoritativeAttackTotal(target, damageBefore, data, slash.name);
      if (!authoritative.ok) return { ok: false, uncertain: true, damage: authoritative.total, reason: authoritative.reason };
      const cumulative = authoritative.total;
      const hit = Math.max(0, cumulative - damageBefore);
      if (Number.isFinite(parseNumber(data.stamina))) state.liveResources.stamina = parseNumber(data.stamina);
      else state.liveResources.stamina = Math.max(0, currentStamina() - slash.stamina);
      if (data.retaliation?.user_hp_after != null) state.liveResources.hp = Number(data.retaliation.user_hp_after);
      updateLiveExpFromAttack(data);
      const critical = responseWasCritical(data);
      const markEffect = updateMarkStateFromResponse(target, data);
      if (hit > 0 && !markEffect.reduced) getSlashModel(target).observe({ damage: hit, stamina: slash.stamina, critical });
      if (data?.phase?.changed === true) {
        invalidateCombatPreflight(target);
        resetSlashModel(target, 'server phase changed');
        resetDirectSkillModels(target);
        state.markTurnsByEncounter[markStateKey(target)] = 0;
      }
      state.session.stats.attacks += 1;
      state.session.stats.damage += Math.max(0, hit);
      state.session.stats.staminaUsed += slash.stamina;
      const calibrationTag = critical ? ' [critical calibration]' : (slash.calibration ? ' [calibration]' : '');
      const markPrefix = markEffect.applied
        ? `🌙 Mark ${markEffect.turns}/${markEffect.total} • `
        : markEffect.cleared
          ? '🌙 Mark cleared • '
          : (markEffect.active && markEffect.total > 0 ? `🌙 Mark ${markEffect.turns}/${markEffect.total} • ` : '');
      pushLog('combat', `${markPrefix}${slash.name}${calibrationTag} → ${target.name}: +${Math.round(hit).toLocaleString()} DMG | ${Math.round(cumulative).toLocaleString()}/${Math.round(target.damageLimit).toLocaleString()}`);
      emit();
      noteCombatAction(target);
      await sleep(state.settings.attackCooldownMs);
      return { ok: true, damage: cumulative, hit, slash };
    } finally {
      state.attackInFlight = false;
    }
  }
  async function executeCombatTarget(target) {
    if (!target || state.status !== ENGINE_STATES.RUNNING) return;
    if (!await ensureTargetLoadout(target)) return;
    if (state.status !== ENGINE_STATES.RUNNING) return;
    let snapshot = await combatPreflight(target, true);
    if (!snapshot.ok || !snapshot.identityOk) {
      pushLog('warning', `Target state changed before combat: ${target.name}.`);
      await reconcileScanner();
      return;
    }
    if (snapshot.phaseDuel) {
      const phaseResult = await handleMonsterPhase(target, snapshot.phaseDuel);
      if (!phaseResult.ok) return;
      resetSlashModel(target, 'Phase 2 completed; recalibrating Phase 3');
      resetDirectSkillModels(target);
      state.markTurnsByEncounter[markStateKey(target)] = 0;
      invalidateCombatPreflight(target);
      snapshot = await combatPreflight(target, true);
      if (!snapshot.ok || !snapshot.identityOk) {
        await reconcileScanner();
        return;
      }
    }
    if (target.phaseWaiting && getPhaseProgress(target).stage !== 'phase3') {
      const key = phaseProgressKey(target);
      const lastLog = Number(state.phaseWaitLogAt[key]) || 0;
      if (Date.now() - lastLog >= 30_000) {
        state.phaseWaitLogAt[key] = Date.now();
        pushLog('phase', `Waiting for Phase 2 PvP before Phase 3 damage on ${target.name}.`);
      }
      invalidateCombatPreflight(target);
      const polls = Math.max(0, Number(state.phaseWaitPolls[key]) || 0) + 1;
      state.phaseWaitPolls[key] = polls;
      const waitMs = polls <= 2 ? Math.max(2000, state.settings.phasePollMs)
        : polls <= 6 ? 5000
          : 10_000;
      await sleep(waitMs);
      return;
    }
    if (snapshot.joinRequired) {
      const joined = await joinTarget(target, snapshot);
      if (!joined) return;
      await sleep(200);
      invalidateCombatPreflight(target);
      snapshot = await combatPreflight(target, true);
      if (!snapshot.ok || !snapshot.identityOk) {
        await reconcileScanner();
        return;
      }
      if (snapshot.phaseDuel) {
        const phaseResult = await handleMonsterPhase(target, snapshot.phaseDuel);
        if (!phaseResult.ok) return;
        resetSlashModel(target, 'Phase 2 completed; recalibrating Phase 3');
        resetDirectSkillModels(target);
        state.markTurnsByEncounter[markStateKey(target)] = 0;
        snapshot = await fetchBattleSnapshot(target);
        if (!snapshot.ok || !snapshot.identityOk) {
          await reconcileScanner();
          return;
        }
        if (snapshot.joinRequired) {
          const phase3Joined = await joinTarget(target, snapshot);
          if (!phase3Joined) return;
          await sleep(200);
          invalidateCombatPreflight(target);
          snapshot = await combatPreflight(target, true);
          if (!snapshot.ok || !snapshot.identityOk) {
            await reconcileScanner();
            return;
          }
        }
      }
    }
    let damage = await authoritativeDamage(target, snapshot);
    if (!Number.isFinite(damage)) {
      pushLog('warning', `Authoritative damage could not be verified for ${target.name}; no attack sent.`);
      return;
    }
    damage = recordEncounterDamage(target, damage);
    while (state.status === ENGINE_STATES.RUNNING && sameRuntimeTarget(state.currentTarget, target)) {
      applyCurrentPhaseBudget(target, damage);
      const remaining = target.damageLimit - damage;
      if (!(remaining > 0)) {
        if (target.phaseStage === 'phase1' && target.phase3DamageLimit > 0) {
          const key = phaseProgressKey(target);
          const lastLog = Number(state.phaseWaitLogAt[key]) || 0;
          if (Date.now() - lastLog >= 30_000) {
            state.phaseWaitLogAt[key] = Date.now();
            pushLog('phase', `Phase 1 target reached for ${target.name}; waiting for Phase 2 PvP and Phase 3.`);
          }
          decideNow();
          return;
        }
        state.session.stats.completed += 1;
        if (target.phaseStage === 'phase3') {
          getPhaseProgress(target).stage = 'complete';
          savePhaseRuntime(state.phaseProgress);
        }
        const phaseLabel = target.phaseStage === 'phase3' ? 'Phase 3 damage target' : 'Damage target';
        const shownDamage = target.phaseStage === 'phase3' ? Math.max(0, damage - (Number(target.phase3Baseline) || 0)) : damage;
        const shownLimit = target.phaseStage === 'phase3' ? target.phase3DamageLimit : target.damageLimit;
        pushLog('done', `${phaseLabel} reached for ${target.name}: ${Math.round(shownDamage).toLocaleString()}/${Math.round(shownLimit).toLocaleString()}.`);
        decideNow();
        return;
      }
      const hpNow = currentHp();
      if (Number.isFinite(hpNow) && hpNow <= 0) {
        const usedPotion = await handleZeroResourceOnce();
        if (usedPotion) continue;
        pushLog('warning', `HP is 0 for ${target.name}; no usable selected HP potion is available.`);
        return;
      }
      let stamina = currentStamina();
      if (stamina == null) {
        const freshResources = await fetchFreshPlayerState();
        stamina = freshResources?.stamina ?? null;
        if (stamina == null) {
          pushLog('warning', `Stamina could not be verified for ${target.name}; no attack or potion request was sent.`);
          return;
        }
      }
      if (!(stamina > 0)) {
        const usedPotion = await handleZeroResourceOnce();
        if (usedPotion) continue;
        let zeroThreshold = smartLootThresholdState(currentExpState());
        if (!Number.isFinite(zeroThreshold.remainingExp)) {
          const freshResources = await fetchFreshPlayerState();
          zeroThreshold = smartLootThresholdState(freshResources);
        }
        if (await useOnePotionForPreferredSlash(target, damage, stamina, zeroThreshold)) continue;
        pushLog('warning', zeroThreshold.eligible
          ? `No stamina available for ${target.name}; EXP is inside the Auto Loot window, so stamina potion use is blocked.`
          : `No stamina available for ${target.name}; no verified higher slash currently justifies a stamina potion.`);
        return;
      }
      const lootThreshold = smartLootThresholdState(currentExpState());
      if (lootThreshold.eligible && stamina < AUTO_LOOT_STAMINA_TRIGGER) {
        const recoveredByLoot = await trySmartAutoLoot();
        if (recoveredByLoot === true) continue;
        if (recoveredByLoot === 'hold') return;
        pushLog('warning', `Stamina is below ${AUTO_LOOT_STAMINA_TRIGGER} and EXP is inside the Auto Loot window; eligible loot did not restore stamina, and potion use remains blocked.`);
        return;
      }
      if (markTurns(target) > 0) {
        const oneStam = { ...SLASH_TIERS[SLASH_TIERS.length - 1], estimatedDamage: null, markOverride: true };
        const markedResult = await attackOnce(target, damage, oneStam, true);
        if (markedResult.reason === 'phase-duel' && markedResult.phase) {
          const phaseResult = await handleMonsterPhase(target, markedResult.phase);
          if (!phaseResult.ok) return;
          const phase3Ready = await preparePhase3Combat(target);
          if (!phase3Ready.ok) return;
          damage = phase3Ready.damage;
          continue;
        }
        if (markedResult.cooldownOnly) continue;
        if (!markedResult.ok) return;
        damage = Number.isFinite(Number(markedResult.damage)) ? Number(markedResult.damage) : damage;
        continue;
      }
      const encounterSlashModel = getSlashModel(target);
      if (!(encounterSlashModel.damagePerStamina > 0) || encounterSlashModel.samples < 1) {
        const calibrationSlash = encounterSlashModel.choose({
          remainingDamage: remaining,
          damageLimit: target.damageLimit,
          staminaAvailable: stamina,
          softOvershootPct: state.settings.softOvershootPct
        });
        if (!calibrationSlash) return;
        const calibrationResult = await attackOnce(target, damage, calibrationSlash);
        if (calibrationResult.reason === 'phase-duel' && calibrationResult.phase) {
          const phaseResult = await handleMonsterPhase(target, calibrationResult.phase);
          if (!phaseResult.ok) return;
          const phase3Ready = await preparePhase3Combat(target);
          if (!phase3Ready.ok) return;
          damage = phase3Ready.damage;
          continue;
        }
        if (calibrationResult.cooldownOnly) continue;
        if (!calibrationResult.ok) return;
        damage = Number.isFinite(Number(calibrationResult.damage)) ? Number(calibrationResult.damage) : damage;
        continue;
      }
      // Inside the EXP recovery window, spend one damage-safe slash of at most
      // 10 stamina so 10-19 remaining stamina becomes <10 and loot can begin on
      // the next loop. This replaces the old requirement to reach exactly zero.
      if (lootThreshold.eligible && stamina < AUTO_LOOT_STAMINA_TRIGGER * 2) {
        const drainSlash = encounterSlashModel.choose({
          remainingDamage: remaining,
          damageLimit: target.damageLimit,
          staminaAvailable: Math.min(stamina, AUTO_LOOT_STAMINA_TRIGGER),
          softOvershootPct: state.settings.softOvershootPct
        });
        if (!drainSlash) return;
        const drainResult = await attackOnce(target, damage, drainSlash, true);
        if (drainResult.reason === 'phase-duel' && drainResult.phase) {
          const phaseResult = await handleMonsterPhase(target, drainResult.phase);
          if (!phaseResult.ok) return;
          const phase3Ready = await preparePhase3Combat(target);
          if (!phase3Ready.ok) return;
          damage = phase3Ready.damage;
          continue;
        }
        if (drainResult.cooldownOnly) continue;
        if (!drainResult.ok) return;
        damage = Number.isFinite(Number(drainResult.damage)) ? Number(drainResult.damage) : damage;
        continue;
      }
      const selectedSkills = selectedActiveSkills(target);
      let skillResult = null;
      let directUsed = false;
      if (selectedSkills.directs.length) {
        const directSkill = selectedSkills.directs[state.directSkillCursor % selectedSkills.directs.length];
        state.directSkillCursor = (state.directSkillCursor + 1) % Math.max(1, selectedSkills.directs.length);
        skillResult = await performActiveSkill(target, damage, directSkill);
        if (skillResult.reason === 'phase-duel' && skillResult.phase) {
          const phaseResult = await handleMonsterPhase(target, skillResult.phase);
          if (!phaseResult.ok) return;
          const phase3Ready = await preparePhase3Combat(target);
          if (!phase3Ready.ok) return;
          damage = phase3Ready.damage;
          continue;
        }
        if (!skillResult.ok && !skillResult.cooldownOnly) return;
        if (Number.isFinite(Number(skillResult.damage))) damage = Number(skillResult.damage);
        if (skillResult.done) return;
        if (!skillResult.skippedForLimit && !skillResult.skippedForStamina && !skillResult.skippedForMana && !skillResult.cooldownOnly) directUsed = true;
        if (skillResult.cooldownOnly) continue;
      }
      if (directUsed) continue;
      const slashModel = getSlashModel(target);
      if (await useOnePotionForPreferredSlash(target, damage, currentStamina(), lootThreshold)) continue;
      const slash = slashModel.choose({
        remainingDamage: target.damageLimit - damage,
        damageLimit: target.damageLimit,
        staminaAvailable: currentStamina(),
        softOvershootPct: state.settings.softOvershootPct
      });
      if (!slash) return;
      if (Number(slash.stamina) === 1000 && selectedSkills.buffs.length) {
        let buffDeferred = false;
        for (const buffSkill of selectedSkills.buffs) {
          skillResult = await performActiveSkill(target, damage, buffSkill);
          if (skillResult.reason === 'phase-duel' && skillResult.phase) break;
          if (!skillResult.ok && !skillResult.cooldownOnly) return;
          if (Number.isFinite(Number(skillResult.damage))) damage = Number(skillResult.damage);
          if (skillResult.done) return;
          if (skillResult.cooldownOnly || skillResult.skippedForMana || skillResult.skippedForStamina) { buffDeferred = true; break; }
        }
        if (skillResult?.reason === 'phase-duel' && skillResult.phase) {
          const phaseResult = await handleMonsterPhase(target, skillResult.phase);
          if (!phaseResult.ok) return;
          const phase3Ready = await preparePhase3Combat(target);
          if (!phase3Ready.ok) return;
          damage = phase3Ready.damage;
          continue;
        }
        if (buffDeferred) continue;
      }
      const result = await attackOnce(target, damage, slash);
      if (result.reason === 'phase-duel' && result.phase) {
        const phaseResult = await handleMonsterPhase(target, result.phase);
        if (!phaseResult.ok) return;
        const phase3Ready = await preparePhase3Combat(target);
        if (!phase3Ready.ok) return;
        damage = phase3Ready.damage;
        continue;
      }
      if (result.cooldownOnly) continue;
      if (!result.ok) {
        if (['stale-target', 'dead'].includes(result.reason)) await reconcileScanner();
        return;
      }
      damage = Number.isFinite(Number(result.damage)) ? Number(result.damage) : damage;
    }
  }
  async function combatLoop() {
    while (state.status === ENGINE_STATES.RUNNING) {
      try {
        if (!state.currentTarget) decideNow();
        const target = state.currentTarget ? clone(state.currentTarget) : null;
        if (!target) {
          await runPendingDungeonLootSweep();
          await sleep(350);
          continue;
        }
        await executeCombatTarget(target);
        if (state.status === ENGINE_STATES.RUNNING) {
          decideNow();
          await sleep(75);
        }
      } catch (error) {
        if (error?.name === 'AbortError') break;
        state.lastError = String(error?.message || error);
        state.session.stats.errors += 1;
        pushLog('error', `Combat controller error: ${state.lastError}`);
        try { await sleep(800); } catch (_) { break; }
      }
    }
  }
  function ensureCombatLoop() {
    if (state.status !== ENGINE_STATES.RUNNING) return null;
    if (state.combatLoopPromise) return state.combatLoopPromise;
    state.combatLoopPromise = combatLoop().finally(() => {
      state.combatLoopPromise = null;
      if (state.status === ENGINE_STATES.RUNNING) {
        Promise.resolve().then(() => ensureCombatLoop());
      }
    });
    return state.combatLoopPromise;
  }
  function resetSession() {
    state.session = {
      id: `session:${Date.now()}`,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      elapsedBeforeStopMs: 0,
      stats: {
        completed: 0,
        attacks: 0,
        damage: 0,
        staminaUsed: 0,
        potions: 0,
        hpPotions: 0,
        staminaPotions: 0,
        manaPotions: 0,
        mobsLooted: 0,
        mobsUnlooted: 0,
        xpLooted: 0,
        errors: 0
      }
    };
    state.slashModels.clear();
    state.skillDamageModels.clear();
    state.encounterLedger = {};
    state.phaseWaitLogAt = {};
    state.phaseWaitPolls = {};
    state.markTurnsByEncounter = {};
    state.markTotalByEncounter = {};
    state.directSkillCursor = 0;
    state.potionUsage = {};
    state.failedLoadoutGroups.clear();
    state.failedLoadoutAt.clear();
    state.activeLoadout = { equipmentPresetId:null, petPresetId:null, detected:false, checkedAt:0 };
    state.attackInFlight = false;
    invalidateCombatPreflight();
    state.potionInFlight = false;
    state.lootInFlight = false;
    state.dungeonLootSweepPending = false;
    state.dungeonLootSweepPromise = null;
    state.lastDungeonLootSweepAt = 0;
  }
  async function start() {
    if (state.status === ENGINE_STATES.RUNNING || state.status === ENGINE_STATES.STARTING) {
      return getRuntimeState();
    }
    state.status = ENGINE_STATES.STARTING;
    state.lastError = null;
    state.abortController?.abort();
    state.abortController = new AbortController();
    resetSession();
    pushLog('start', 'Automation session started.');
    state.status = ENGINE_STATES.RUNNING;
    state.liveResources = clone(window.AURELIX?.getReport?.()?.resources?.player || {});
    syncLegacyPresets();
    try { await detectActiveLoadout(); }
    catch (error) {
      if (error?.name === 'AbortError') return getRuntimeState();
      pushLog('warning', `Initial loadout detection unavailable: ${error?.message || error}. Presets will still be verified before combat.`);
    }
    const report = window.AURELIX?.getReport?.();
    if (!report) await reconcileScanner();
    else decideNow();
    void refreshActiveSkills(Object.keys(state.skillCatalog).length === 0);
    state.dungeonLootSweepPending = state.settings.autoLoot !== false;
    ensureCombatLoop();
    emit();
    return getRuntimeState();
  }
  function stop() {
    if (state.status === ENGINE_STATES.OFF || state.status === ENGINE_STATES.STOPPING) {
      return getRuntimeState();
    }
    state.status = ENGINE_STATES.STOPPING;
    state.abortController?.abort();
    if (state.session.startedAt && !state.session.stoppedAt) {
      const started = Date.parse(state.session.startedAt);
      if (Number.isFinite(started)) state.session.elapsedBeforeStopMs = Math.max(0, Date.now() - started);
      state.session.stoppedAt = new Date().toISOString();
    }
    state.currentTarget = null;
    state.currentPlan = null;
    state.status = ENGINE_STATES.OFF;
    pushLog('stop', 'Automation session stopped.');
    emit();
    return getRuntimeState();
  }
  function pause() {
    if (state.status !== ENGINE_STATES.RUNNING) return getRuntimeState();
    state.status = ENGINE_STATES.PAUSED;
    state.abortController?.abort();
    pushLog('system', 'Automation paused.');
    emit();
    return getRuntimeState();
  }
  function resume() {
    if (state.status !== ENGINE_STATES.PAUSED) return getRuntimeState();
    state.status = ENGINE_STATES.RUNNING;
    state.abortController = new AbortController();
    decideNow();
    ensureCombatLoop();
    pushLog('system', 'Automation resumed.');
    emit();
    return getRuntimeState();
  }
  function runtimeElapsedMs() {
    if (!state.session.startedAt) return 0;
    if (state.status === ENGINE_STATES.OFF && state.session.stoppedAt) {
      return state.session.elapsedBeforeStopMs || 0;
    }
    const start = Date.parse(state.session.startedAt);
    return Number.isFinite(start) ? Math.max(0, Date.now() - start) : 0;
  }
  function getRuntimeState() {
    return {
      engineVersion: ENGINE_VERSION,
      state: state.status,
      running: state.status === ENGINE_STATES.RUNNING,
      paused: state.status === ENGINE_STATES.PAUSED,
      settings: clone(state.settings),
      sessionId: state.session.id,
      startedAt: state.session.startedAt,
      stoppedAt: state.session.stoppedAt,
      elapsedMs: runtimeElapsedMs(),
      summary: clone(state.session.stats),
      resources: { ...clone(window.AURELIX?.getReport?.()?.resources?.player || {}), ...clone(state.liveResources) },
      currentTarget: clone(state.currentTarget),
      currentPlan: clone(state.currentPlan),
      lastDecisionAt: state.lastDecisionAt,
      lastScannerSeq: state.lastScannerSeq,
      lastReportGeneratedAt: state.lastReportGeneratedAt,
      lastError: state.lastError,
      liveActionsEnabled: true,
      attackInFlight: state.attackInFlight,
      potionInFlight: state.potionInFlight,
      lootInFlight: state.lootInFlight,
      loadoutInFlight: state.loadoutInFlight,
      activeLoadout: clone(state.activeLoadout),
      potionUsage: clone(state.potionUsage),
      activeSkills: getActiveSkills(),
      activeSkillTargets: clone(state.skillTargetPolicy),
      slashModels: Object.fromEntries([...state.slashModels.entries()].map(([key, model]) => [key, model.snapshot()])),
      skillDamageModels: clone(Object.fromEntries(state.skillDamageModels.entries()))
    };
  }
  function getLogs() {
    return clone(state.log);
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }
  function status() {
    const runtime = getRuntimeState();
    return {
      version: ENGINE_VERSION,
      state: runtime.state,
      running: runtime.running,
      scannerAvailable: !!window.AURELIX?.getReport,
      scannerSeq: runtime.lastScannerSeq,
      currentTarget: runtime.currentTarget?.name || null,
      currentPlan: runtime.currentPlan?.nextStage || null,
      liveActionsEnabled: true
    };
  }
  function saveAllConfiguration() {
    const savedAt = new Date().toISOString();
    const snapshot = {
      version: ENGINE_VERSION,
      savedAt,
      settings: clone(state.settings),
      targets: clone(state.targetPolicy),
      catalog: clone(state.targetCatalog),
      potions: clone(state.potionPolicy),
      skills: clone(state.skillPolicy),
      skillTargets: clone(state.skillTargetPolicy),
      equipmentPresets: clone(state.equipmentPresets),
      petPresets: clone(state.petPresets),
      loadoutAssignments: clone(state.loadoutAssignments)
    };
    const results = {
      settings: saveObject(ENGINE_STORE.settings, state.settings),
      targets: saveObject(ENGINE_STORE.targets, state.targetPolicy),
      catalog: saveObject(ENGINE_STORE.catalog, state.targetCatalog),
      potions: saveObject(ENGINE_STORE.potions, state.potionPolicy),
      skills: saveObject(ENGINE_STORE.skills, state.skillPolicy),
      skillTargets: saveObject(ENGINE_STORE.skillTargets, state.skillTargetPolicy),
      equipmentPresets: saveObject(ENGINE_STORE.equipmentPresets, state.equipmentPresets),
      petPresets: saveObject(ENGINE_STORE.petPresets, state.petPresets),
      loadoutAssignments: saveObject(ENGINE_STORE.loadoutAssignments, state.loadoutAssignments),
      snapshot: saveObject(ENGINE_STORE.manualSnapshot, snapshot)
    };
    const verify = loadObject(ENGINE_STORE.manualSnapshot, {});
    const verifiedTargets = loadObject(ENGINE_STORE.targets, {});
    const verified = verify?.savedAt === savedAt &&
      JSON.stringify(verifiedTargets) === JSON.stringify(state.targetPolicy) &&
      JSON.stringify(verify?.targets || {}) === JSON.stringify(state.targetPolicy);
    const ok = Object.values(results).every(Boolean) && verified;
    pushLog(ok ? 'success' : 'error', ok ? 'Configuration saved permanently.' : 'Configuration save verification failed.', { savedAt, results, verified });
    return { ok, savedAt, results, verified };
  }
  window.AURELIX_ENGINE = Object.freeze({
    version: ENGINE_VERSION,
    states: ENGINE_STATES,
    slashTiers: SLASH_TIERS,
    start,
    stop,
    pause,
    resume,
    status,
    decideNow,
    reconcileScanner,
    getRuntimeState,
    getUiState,
    getSettings,
    setSettings,
    getTargetPolicies,
    getTargetUiModels,
    getTargetCatalog: () => clone(discoverLogicalTargets()),
    setTargetPolicy,
    bulkSetTargetPolicies,
    getPotionPolicy,
    getPotionModels,
    setPotionPolicy,
    getActiveSkills,
    setActiveSkillPolicy,
    setActiveSkillTargetPolicy,
    bulkSetActiveSkillTargetPolicies,
    getLoadoutState,
    syncLegacyPresets,
    detectActiveLoadout,
    setTargetLoadoutAssignment,
    captureEquipmentPreset,
    capturePetPreset,
    getPetCatalogue,
    getPetLinkCandidates,
    savePetPresetDefinition,
    duplicatePetPreset,
    renameLoadoutPreset,
    updateLoadoutPreset,
    deleteLoadoutPreset,
    applyLoadoutAssignment,
    saveAllConfiguration,
    refreshActiveSkills,
    getLogs,
    subscribe,
    logicalTargetKey,
    runtimeEncounterKey
  });
  console.log('[AURELIX] Combat Engine v' + ENGINE_VERSION + ' loaded. Live PvE combat enabled.');
})();
(() => {
  'use strict';
  const VERSION = '0.5.62';
  const STORE = Object.freeze({
    tab: 'aurelix_ui_tab_v020',
    minimized: 'aurelix_ui_minimized_v020',
    width: 'aurelix_ui_width_v020',
    height: 'aurelix_ui_height_v020',
    scale: 'aurelix_ui_scale_v020',
    theme: 'aurelix_ui_theme_v020',
    effects: 'aurelix_ui_effects_v020',
    effectsRepair: 'aurelix_ui_effects_repair_v0546',
    miniX: 'aurelix_ui_mini_x_v022',
    miniY: 'aurelix_ui_mini_y_v022'
  });
  function uiStoreGet(key, fallback = null) {
    let gmValue;
    let gmReadable = false;
    try {
      if (typeof GM_getValue === 'function') {
        gmReadable = true;
        gmValue = GM_getValue(key, undefined);
        if (gmValue !== undefined) return gmValue;
      }
    } catch (_) {}
    let local = null;
    try { local = localStorage.getItem(key); } catch (_) {}
    if (local !== null) {
      if (gmReadable) {
        try { if (typeof GM_setValue === 'function') GM_setValue(key, local); } catch (_) {}
      }
      return local;
    }
    return fallback;
  }
  function uiStoreSet(key, value) {
    try { if (typeof GM_setValue === 'function') GM_setValue(key, String(value)); } catch (_) {}
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  const DEFAULTS = Object.freeze({
    width: 920,
    height: 700,
    scale: 1.0,
    theme: 'aegis',
    effects: true
  });

  try {
    if (window.CSS?.registerProperty) {
      CSS.registerProperty({
        name: '--ax-orbit',
        syntax: '<angle>',
        inherits: false,
        initialValue: '0deg'
      });
    }
  } catch (_) {}

  const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
  @property --ax-orbit { syntax: '<angle>'; inherits: false; initial-value: 0deg; }

  #aurelix-ui, #aurelix-ui * { box-sizing: border-box; }

  /* Modern Scrollbars */
  #aurelix-ui ::-webkit-scrollbar { width: 8px; height: 8px; }
  #aurelix-ui ::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); border-radius: 4px; }
  #aurelix-ui ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
  #aurelix-ui ::-webkit-scrollbar-thumb:hover { background: var(--ax-cyan); }

  /* COLOR SHIFTING TEXT ANIMATION */
  @keyframes textHueShift {
    0% { filter: hue-rotate(0deg) drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
    50% { filter: hue-rotate(180deg) drop-shadow(0 0 12px rgba(255,255,255,0.3)); }
    100% { filter: hue-rotate(360deg) drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
  }

  /* BORDER GLOW ANIMATION */
  @keyframes containerGlow {
    0% { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 10px var(--ax-cyan), inset 0 0 5px var(--ax-cyan); border-color: var(--ax-cyan); }
    33% { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 15px var(--ax-blue), inset 0 0 8px var(--ax-blue); border-color: var(--ax-blue); }
    66% { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 15px var(--ax-violet), inset 0 0 8px var(--ax-violet); border-color: var(--ax-violet); }
    100% { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 10px var(--ax-cyan), inset 0 0 5px var(--ax-cyan); border-color: var(--ax-cyan); }
  }

  #aurelix-ui {
    --ax-w: ${DEFAULTS.width}px;
    --ax-h: ${DEFAULTS.height}px;
    --ax-scale: 1;
    --ax-bg: #0b111a;
    --ax-bg-2: #131b26;
    --ax-panel: rgba(17, 24, 39, 0.95);
    --ax-panel-soft: rgba(31, 41, 55, 0.85);
    --ax-line: rgba(255, 255, 255, 0.08);
    --ax-line-strong: rgba(255, 255, 255, 0.16);
    --ax-text: #f3f4f6;
    --ax-muted: #9ca3af;
    --ax-cyan: #38bdf8;
    --ax-blue: #3b82f6;
    --ax-violet: #8b5cf6;
    --ax-gold: #fbbf24;
    --ax-green: #10b981;
    --ax-red: #ef4444;
    --ax-orange: #f97316;
    --ax-root-bg: linear-gradient(145deg, #0b111a 0%, #131b26 100%);
    --ax-header-bg: rgba(15, 23, 42, 0.98);
    --ax-nav-bg: rgba(11, 17, 32, 0.96);
    --ax-card-bg: rgba(30, 41, 59, 0.35);

    position: fixed;
    left: 50%;
    top: 52%;
    transform: translate(-50%, -50%);
    width: min(var(--ax-w), calc(100vw - 16px));
    height: min(var(--ax-h), calc(100dvh - 16px));
    min-width: 720px;
    min-height: 520px;
    z-index: 2147483000;
    color: var(--ax-text);
    font-family: "Inter", system-ui, -apple-system, sans-serif;
    font-size: calc(13px * var(--ax-scale));
    line-height: 1.5;
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
    background: var(--ax-root-bg);
    border-radius: 12px;
    overflow: hidden;
    isolation: isolate;
    color-scheme: dark;

    /* Apply glowing border animation */
    border: 1px solid var(--ax-cyan);
    animation: containerGlow 8s infinite alternate ease-in-out;
  }

  /* GPU Effects - Disabled by default for low-end device safety */
  #aurelix-ui:not(.ax-effects-off)::before {
    content: ""; position: absolute; inset: 0; z-index: 5; pointer-events: none; border-radius: inherit; padding: 2px;
    background: conic-gradient(from var(--ax-orbit), transparent 0deg 60deg, var(--ax-cyan) 120deg, var(--ax-blue) 180deg, transparent 240deg 360deg);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
    animation: axOrbit 5s linear infinite; opacity: 0.6;
  }
  @keyframes axOrbit { to { --ax-orbit: 360deg; } }
  #aurelix-ui.ax-effects-off { animation: none !important; border-color: var(--ax-line-strong) !important; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7) !important; }
  #aurelix-ui.ax-effects-off::before, #aurelix-ui.ax-effects-off::after { display: none !important; }
  #aurelix-ui.ax-effects-off *:not(.ax-scan-spinner) { animation: none !important; transition-duration: 0s !important; }

  /* Minimal, Clean Themes */
  #aurelix-ui[data-theme="crimsonCore"] { --ax-root-bg: linear-gradient(145deg, #18090a 0%, #0d0404 100%); --ax-header-bg: rgba(20, 6, 7, 0.98); --ax-card-bg: rgba(30, 10, 12, 0.4); --ax-cyan: #ef4444; --ax-blue: #f97316; }
  #aurelix-ui[data-theme="aegis"] { --ax-root-bg: linear-gradient(145deg, #0a131e 0%, #050a11 100%); --ax-header-bg: rgba(6, 15, 26, 0.98); --ax-card-bg: rgba(15, 30, 48, 0.4); --ax-cyan: #38bdf8; --ax-blue: #3b82f6; }
  #aurelix-ui[data-theme="abyss"] { --ax-root-bg: linear-gradient(145deg, #11091f 0%, #07040e 100%); --ax-header-bg: rgba(14, 7, 28, 0.98); --ax-card-bg: rgba(25, 12, 45, 0.4); --ax-cyan: #c084fc; --ax-blue: #8b5cf6; }
  #aurelix-ui[data-theme="royal"] { --ax-root-bg: linear-gradient(145deg, #180a1e 0%, #0a030d 100%); --ax-cyan: #f472b6; --ax-blue: #d946ef; }
  #aurelix-ui[data-theme="forge"] { --ax-root-bg: linear-gradient(145deg, #1e0e07 0%, #0a0402 100%); --ax-cyan: #fb923c; --ax-blue: #f97316; }
  #aurelix-ui[data-theme="emerald"] { --ax-root-bg: linear-gradient(145deg, #051c14 0%, #020b08 100%); --ax-cyan: #34d399; --ax-blue: #10b981; }
  #aurelix-ui[data-theme="nova"] { --ax-root-bg: linear-gradient(145deg, #1a0810 0%, #0d0307 100%); --ax-cyan: #fb7185; --ax-blue: #e11d48; }

  /* NEW THEMES */
  #aurelix-ui[data-theme="cyberpunk"] {
    --ax-bg:#0d0208; --ax-bg-2:#1a0b1c; --ax-panel:rgba(20,5,25,.90); --ax-panel-soft:rgba(30,10,40,.78);
    --ax-cyan:#00ffcc; --ax-blue:#ff00ff; --ax-violet:#bc13fe; --ax-gold:#fcee0a;
    --ax-root-bg: radial-gradient(circle at 80% 20%,rgba(0,255,204,.15),transparent 40%), radial-gradient(circle at 20% 80%,rgba(255,0,255,.15),transparent 40%), linear-gradient(145deg,#0d0208 0%,#1a0b1c 100%);
    --ax-header-bg:rgba(20,5,25,.95); --ax-nav-bg:rgba(15,3,20,.95); --ax-card-bg:rgba(30,10,40,.5);
  }
  #aurelix-ui[data-theme="frostbite"] {
    --ax-bg:#010a15; --ax-bg-2:#031429; --ax-panel:rgba(5,25,50,.90); --ax-panel-soft:rgba(10,35,65,.78);
    --ax-cyan:#00e5ff; --ax-blue:#0088ff; --ax-violet:#55aaff; --ax-gold:#aaddff;
    --ax-root-bg: radial-gradient(circle at 75% 25%,rgba(0,229,255,.15),transparent 40%), radial-gradient(circle at 25% 75%,rgba(0,136,255,.15),transparent 40%), linear-gradient(145deg,#010a15 0%,#031429 100%);
    --ax-header-bg:rgba(5,25,50,.95); --ax-nav-bg:rgba(3,20,40,.95); --ax-card-bg:rgba(10,35,65,.5);
  }
  #aurelix-ui[data-theme="voidglitch"] {
    --ax-bg:#05000a; --ax-bg-2:#0a0015; --ax-panel:rgba(15,0,25,.90); --ax-panel-soft:rgba(25,0,40,.78);
    --ax-cyan:#39ff14; --ax-blue:#cc00ff; --ax-violet:#ff003c; --ax-gold:#ffb300;
    --ax-root-bg: radial-gradient(circle at 85% 15%,rgba(57,255,20,.12),transparent 30%), radial-gradient(circle at 15% 85%,rgba(204,0,255,.12),transparent 30%), linear-gradient(145deg,#05000a 0%,#0a0015 100%);
    --ax-header-bg:rgba(15,0,25,.95); --ax-nav-bg:rgba(10,0,20,.95); --ax-card-bg:rgba(25,0,40,.5);
  }
  #aurelix-ui[data-theme="aurora"] { --ax-root-bg: radial-gradient(circle at 15% 15%,rgba(45,212,191,.22),transparent 38%), radial-gradient(circle at 85% 80%,rgba(168,85,247,.2),transparent 42%), linear-gradient(145deg,#04151b,#100a22); --ax-header-bg:rgba(5,22,29,.96); --ax-nav-bg:rgba(7,15,29,.96); --ax-card-bg:rgba(15,38,49,.48); --ax-cyan:#2dd4bf; --ax-blue:#8b5cf6; --ax-violet:#c084fc; --ax-gold:#f9e27d; }
  #aurelix-ui[data-theme="solarFlare"] { --ax-root-bg: radial-gradient(circle at 82% 12%,rgba(251,191,36,.24),transparent 36%), radial-gradient(circle at 12% 88%,rgba(239,68,68,.18),transparent 40%), linear-gradient(145deg,#260b05,#0e0302); --ax-header-bg:rgba(38,11,5,.97); --ax-nav-bg:rgba(24,6,4,.96); --ax-card-bg:rgba(70,22,9,.42); --ax-cyan:#fb923c; --ax-blue:#ef4444; --ax-violet:#f43f5e; --ax-gold:#fde047; }
  #aurelix-ui[data-theme="obsidianGold"] { --ax-root-bg: radial-gradient(circle at 50% -10%,rgba(234,179,8,.16),transparent 42%), linear-gradient(145deg,#11100d,#030303); --ax-header-bg:rgba(15,14,11,.98); --ax-nav-bg:rgba(8,8,7,.98); --ax-card-bg:rgba(39,35,24,.46); --ax-cyan:#eab308; --ax-blue:#f59e0b; --ax-violet:#d6b96d; --ax-gold:#fff1a8; }
  #aurelix-ui[data-theme="sakuraNight"] { --ax-root-bg: radial-gradient(circle at 80% 18%,rgba(244,114,182,.2),transparent 38%), radial-gradient(circle at 18% 82%,rgba(129,140,248,.17),transparent 42%), linear-gradient(145deg,#1d0b1b,#090611); --ax-header-bg:rgba(29,11,27,.97); --ax-nav-bg:rgba(18,7,19,.97); --ax-card-bg:rgba(55,20,50,.44); --ax-cyan:#f472b6; --ax-blue:#818cf8; --ax-violet:#e879f9; --ax-gold:#fbcfe8; }
  #aurelix-ui[data-theme="pitchBlack"] { --ax-root-bg:linear-gradient(145deg,#000,#080808); --ax-header-bg:#050505; --ax-nav-bg:#020202; --ax-card-bg:#111; --ax-panel:#080808; --ax-panel-soft:#121212; --ax-text:#fff; --ax-muted:#cbd5e1; --ax-line:rgba(255,255,255,.18); --ax-line-strong:rgba(255,255,255,.35); --ax-cyan:#00e5ff; --ax-blue:#4f8cff; --ax-violet:#b66cff; --ax-gold:#ffe45c; }
  #aurelix-ui[data-theme="toxicMatrix"] { --ax-root-bg:linear-gradient(145deg,#010702,#061208); --ax-header-bg:#020a04; --ax-nav-bg:#010602; --ax-card-bg:#09170c; --ax-panel:#041007; --ax-panel-soft:#0a1b0e; --ax-text:#fff; --ax-muted:#c8e6cf; --ax-line:rgba(57,255,20,.22); --ax-line-strong:rgba(57,255,20,.5); --ax-cyan:#39ff14; --ax-blue:#00e676; --ax-violet:#b2ff59; --ax-gold:#f4ff81; }
  #aurelix-ui[data-theme="inferno"] { --ax-root-bg:linear-gradient(145deg,#120100,#260500); --ax-header-bg:#160200; --ax-nav-bg:#0d0100; --ax-card-bg:#2a0904; --ax-panel:#180300; --ax-panel-soft:#2d0a04; --ax-text:#fff; --ax-muted:#ffd4c4; --ax-line:rgba(255,120,40,.25); --ax-line-strong:rgba(255,160,55,.55); --ax-cyan:#ff6a00; --ax-blue:#ff2d00; --ax-violet:#ff006e; --ax-gold:#ffe600; }
  #aurelix-ui[data-theme="spectralGlass"] { --ax-root-bg:linear-gradient(145deg,rgba(2,8,18,.82),rgba(14,6,28,.76)); --ax-header-bg:rgba(3,10,22,.72); --ax-nav-bg:rgba(2,7,17,.68); --ax-card-bg:rgba(10,22,40,.58); --ax-panel:rgba(5,15,29,.72); --ax-panel-soft:rgba(15,30,50,.62); --ax-text:#f8fbff; --ax-muted:#c9d8ea; --ax-line:rgba(102,232,255,.24); --ax-line-strong:rgba(102,232,255,.58); --ax-cyan:#66e8ff; --ax-blue:#5890ff; --ax-violet:#c779ff; --ax-gold:#ffe187; backdrop-filter:blur(18px) saturate(145%); -webkit-backdrop-filter:blur(18px) saturate(145%); }
  #aurelix-ui[data-theme="spectralGlass"].ax-effects-off { background:linear-gradient(145deg,rgba(2,8,18,.97),rgba(14,6,28,.95)); backdrop-filter:none; -webkit-backdrop-filter:none; }
  #aurelix-ui[data-theme="neonNoir"] { --ax-root-bg:radial-gradient(circle at 82% 12%,rgba(0,245,255,.13),transparent 35%),linear-gradient(145deg,#020305,#090b10); --ax-header-bg:#05070a; --ax-nav-bg:#020305; --ax-card-bg:#0c1118; --ax-panel:#070a0f; --ax-panel-soft:#101721; --ax-text:#fff; --ax-muted:#d1d9e5; --ax-line:rgba(0,245,255,.2); --ax-line-strong:rgba(0,245,255,.55); --ax-cyan:#00f5ff; --ax-blue:#448aff; --ax-violet:#d946ef; --ax-gold:#f8ff72; }
  #aurelix-ui[data-theme="deepOcean"] { --ax-root-bg:radial-gradient(circle at 15% 90%,rgba(0,214,190,.16),transparent 42%),linear-gradient(145deg,#001018,#001f2b); --ax-header-bg:#00131d; --ax-nav-bg:#000c13; --ax-card-bg:#062735; --ax-panel:#031b25; --ax-panel-soft:#092f3e; --ax-text:#f5ffff; --ax-muted:#bfe2e5; --ax-line:rgba(71,255,226,.2); --ax-line-strong:rgba(71,255,226,.52); --ax-cyan:#47ffe2; --ax-blue:#22b8ff; --ax-violet:#8b9cff; --ax-gold:#fff08a; }
  #aurelix-ui[data-theme="bloodMoon"] { --ax-root-bg:radial-gradient(circle at 82% 18%,rgba(255,45,85,.2),transparent 34%),linear-gradient(145deg,#120207,#260611); --ax-header-bg:#19030a; --ax-nav-bg:#0c0105; --ax-card-bg:#310a16; --ax-panel:#1d050d; --ax-panel-soft:#390d1b; --ax-text:#fff9fb; --ax-muted:#f0c8d2; --ax-line:rgba(255,82,119,.24); --ax-line-strong:rgba(255,82,119,.58); --ax-cyan:#ff5277; --ax-blue:#ff8a45; --ax-violet:#e85dff; --ax-gold:#ffd166; }
  #aurelix-ui[data-theme="ultraviolet"] { --ax-root-bg:radial-gradient(circle at 20% 15%,rgba(124,58,237,.24),transparent 38%),linear-gradient(145deg,#080312,#17052b); --ax-header-bg:#10051f; --ax-nav-bg:#08020f; --ax-card-bg:#260c40; --ax-panel:#160727; --ax-panel-soft:#30104e; --ax-text:#fff; --ax-muted:#ddccf3; --ax-line:rgba(191,122,255,.25); --ax-line-strong:rgba(191,122,255,.6); --ax-cyan:#c77dff; --ax-blue:#7c7cff; --ax-violet:#ff4fd8; --ax-gold:#ffe66d; }

  /* Structure */
  #aurelix-ui .ax-shell { width: 100%; height: 100%; display: grid; grid-template-rows: auto auto 1fr auto; min-height: 0; }
  #aurelix-ui .ax-header { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--ax-line); background: var(--ax-header-bg); cursor: move; user-select: none; }

  /* Animated Brand Typography */
  #aurelix-ui .ax-brand { display: flex; align-items: baseline; gap: 10px; }
  #aurelix-ui .ax-brand-main {
    font-family: "Cinzel", serif; font-size: calc(22px * var(--ax-scale)); font-weight: 700; color: #fff; letter-spacing: 0.05em; text-transform: uppercase;
    background: linear-gradient(90deg, #fff, var(--ax-cyan), var(--ax-gold), #fff);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: textHueShift 8s linear infinite;
  }
  #aurelix-ui .ax-version { color: var(--ax-cyan); font-size: calc(11px * var(--ax-scale)); font-weight: 600; letter-spacing: 0.05em; }

  /* Header Buttons */
  #aurelix-ui .ax-window-actions { display: flex; align-items: center; gap: 8px; }
  #aurelix-ui .ax-icon-btn, #aurelix-ui .ax-save-btn { border-radius: 6px; border: 1px solid var(--ax-line); background: rgba(255,255,255,0.03); color: var(--ax-text); cursor: pointer; font-family: inherit; font-size: calc(12px * var(--ax-scale)); font-weight: 600; transition: all 0.15s; }
  #aurelix-ui .ax-icon-btn { width: 32px; height: 32px; display: grid; place-items: center; font-size: 16px; }
  #aurelix-ui .ax-save-btn { height: 32px; padding: 0 16px; }
  #aurelix-ui .ax-icon-btn:hover, #aurelix-ui .ax-save-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--ax-line-strong); color: #fff; }
  #aurelix-ui .ax-save-btn.saved { border-color: var(--ax-green); color: var(--ax-green); }
  #aurelix-ui .ax-save-btn.failed { border-color: var(--ax-red); color: var(--ax-red); }

  /* Navigation - Mobile-optimized Horizontal Scroll */
  #aurelix-ui .ax-nav { display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; border-bottom: 1px solid var(--ax-line); background: var(--ax-nav-bg); scrollbar-width: none; }
  #aurelix-ui .ax-nav::-webkit-scrollbar { display: none; }
  #aurelix-ui .ax-nav-btn { flex: 1 0 auto; min-height: 48px; padding: 0 20px; border: 0; border-right: 1px solid var(--ax-line); background: transparent; color: var(--ax-muted); cursor: pointer; font-family: inherit; font-size: calc(13px * var(--ax-scale)); font-weight: 600; transition: all 0.15s; }
  #aurelix-ui .ax-nav-btn:hover { color: #fff; background: rgba(255,255,255,0.03); }
  #aurelix-ui .ax-nav-btn.active { color: var(--ax-cyan); background: rgba(255,255,255,0.05); box-shadow: inset 0 -2px 0 var(--ax-cyan); }

  /* Main Layout */
  #aurelix-ui .ax-content { padding: 20px; overflow-y: auto; }
  #aurelix-ui .ax-view { display: none; }
  #aurelix-ui .ax-view.active { display: block; animation: fadeIn 0.2s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

  /* Cards */
  #aurelix-ui .ax-card { border: 1px solid var(--ax-line); border-radius: 8px; background: var(--ax-card-bg); overflow: hidden; margin-bottom: 16px; }
  #aurelix-ui .ax-card-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--ax-line); background: rgba(0,0,0,0.25); }
  #aurelix-ui .ax-card-head h3 { margin: 0; font-size: calc(14px * var(--ax-scale)); font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px; }
  #aurelix-ui .ax-card-pad { padding: 16px; }

  /* Overview Specific */
  #aurelix-ui .ax-overview { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr); gap: 16px; }

  /* UPDATED: Larger Target Image Layout */
  #aurelix-ui .ax-target-body { display: grid; grid-template-columns: 220px minmax(0,1fr); gap: 20px; padding: 20px; align-items: center; }
  #aurelix-ui .ax-monster-image-wrap { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--ax-line-strong); background: radial-gradient(circle at center, rgba(67,216,255,.05), rgba(0,0,0,0.5)); aspect-ratio: 1; display: grid; place-items: center; box-shadow: inset 0 0 20px rgba(0,0,0,0.8), 0 4px 15px rgba(0,0,0,0.3); }
  #aurelix-ui .ax-monster-image { width: 100%; height: 100%; object-fit: cover; display: none; }
  #aurelix-ui .ax-monster-image.visible { display: block; }
  #aurelix-ui .ax-monster-placeholder { font-weight: 700; color: var(--ax-muted); font-size: calc(48px * var(--ax-scale)); text-shadow: 0 0 15px rgba(255,255,255,0.1); }
  #aurelix-ui .ax-monster-image.visible + .ax-monster-placeholder { display: none; }

  #aurelix-ui .ax-target-info { display: flex; flex-direction: column; justify-content: center; height: 100%; }

  /* Animated Target Name - Larger */
  #aurelix-ui .ax-target-name {
    font-family: "Cinzel", serif; font-size: calc(24px * var(--ax-scale)); font-weight: 800; margin-bottom: 8px;
    background: linear-gradient(90deg, #fff, var(--ax-gold), var(--ax-cyan));
    background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    animation: textHueShift 6s linear infinite;
  }

  #aurelix-ui .ax-target-meta-grid { display: grid; grid-template-columns: 80px 1fr; gap: 6px 12px; margin-top: 8px; font-size: calc(12px * var(--ax-scale)); }
  #aurelix-ui .ax-meta-label { color: var(--ax-muted); font-weight: 600; }
  #aurelix-ui .ax-meta-value { color: #fff; font-weight: 500; }

  /* Progress Bars */
  #aurelix-ui .ax-hp-block { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--ax-line); }
  #aurelix-ui .ax-resource-label-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: calc(12px * var(--ax-scale)); }
  #aurelix-ui .ax-resource-label-row strong { color: var(--ax-text); }
  #aurelix-ui .ax-resource-label-row span { color: var(--ax-muted); font-family: monospace; }
  #aurelix-ui .ax-bar { width: 100%; height: 8px; border-radius: 4px; background: rgba(0,0,0,0.4); border: 1px solid var(--ax-line); overflow: hidden; }
  #aurelix-ui .ax-bar > i { display: block; height: 100%; border-radius: 4px; transition: width 0.3s ease; }
  #aurelix-ui .ax-bar-hp > i { background: linear-gradient(90deg, var(--ax-cyan), var(--ax-gold)); box-shadow: 0 0 8px var(--ax-cyan); }
  #aurelix-ui .ax-bar-stamina > i { background: var(--ax-cyan); box-shadow: 0 0 8px var(--ax-cyan); }
  #aurelix-ui .ax-bar-exp > i { background: var(--ax-gold); box-shadow: 0 0 8px var(--ax-gold); }

  /* Current Action & Buttons */
  #aurelix-ui .ax-action-body { display: flex; justify-content: space-between; align-items: center; padding: 16px; gap: 16px; }
  #aurelix-ui .ax-action-main strong { display: block; font-size: calc(15px * var(--ax-scale)); color: #fff; }
  #aurelix-ui .ax-action-main span { display: block; font-size: calc(12px * var(--ax-scale)); color: var(--ax-muted); margin-top: 4px; }

  #aurelix-ui .ax-engine-button { padding: 12px 24px; border-radius: 6px; border: none; background: var(--ax-green); color: #000; font-family: inherit; font-size: calc(13px * var(--ax-scale)); font-weight: 700; text-transform: uppercase; cursor: pointer; transition: opacity 0.2s; }
  #aurelix-ui .ax-engine-button:hover { opacity: 0.9; }

  /* Summary Table */
  #aurelix-ui .ax-summary-body { padding: 16px; display: grid; gap: 10px; }
  #aurelix-ui .ax-summary-row { display: flex; justify-content: space-between; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: calc(13px * var(--ax-scale)); }
  #aurelix-ui .ax-summary-row span { color: var(--ax-muted); }
  #aurelix-ui .ax-summary-row b { color: #fff; font-family: monospace; }
  #aurelix-ui .ax-summary-row:first-child b { color: var(--ax-gold); }

  /* Shared Form Elements */
  .ax-num, .ax-search, #aurelix-ui .ax-select, #aurelix-ui .ax-range { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--ax-line); background: rgba(0,0,0,0.3); color: #fff; font-family: inherit; font-size: calc(13px * var(--ax-scale)); min-height: 42px; outline: none; transition: border-color 0.2s; }
  .ax-num:focus, .ax-search:focus, #aurelix-ui .ax-select:focus { border-color: var(--ax-cyan); }
  #aurelix-ui .ax-select { color-scheme: dark; background-color: #090511; color: #f8fafc; font-weight: 600; }
  #aurelix-ui .ax-select option { background: #100719; color: #f8fafc; font-weight: 600; }
  #aurelix-ui .ax-select option:checked { background: #38bdf8; color: #061018; }

  #aurelix-ui .ax-choice-btn { padding: 10px 16px; border-radius: 6px; border: 1px solid var(--ax-line); background: rgba(0,0,0,0.2); color: var(--ax-muted); font-family: inherit; font-weight: 600; cursor: pointer; transition: all 0.2s; min-height: 42px; }
  #aurelix-ui .ax-choice-btn:hover { background: rgba(255,255,255,0.05); }
  #aurelix-ui .ax-choice-btn.active { background: rgba(255,255,255,0.08); border-color: var(--ax-cyan); color: var(--ax-cyan); }

  /* THE TOGGLE */
  #aurelix-ui .ax-setting-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  #aurelix-ui .ax-setting-row:last-child { border-bottom: none; }
  #aurelix-ui .ax-setting-copy strong { display: block; font-size: calc(14px * var(--ax-scale)); color: #fff; }
  #aurelix-ui .ax-setting-copy small { display: block; font-size: calc(12px * var(--ax-scale)); color: var(--ax-muted); margin-top: 4px; }

  #aurelix-ui .ax-toggle { width: 44px; height: 24px; border-radius: 12px; background: rgba(255,255,255,0.1); position: relative; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: background 0.2s ease; }
  #aurelix-ui .ax-toggle::after { content: ""; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px; border-radius: 50%; background: #fff; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
  #aurelix-ui .ax-toggle.on { background: var(--ax-cyan); border-color: var(--ax-cyan); }
  #aurelix-ui .ax-toggle.on::after { transform: translateX(20px); }

  /* Complex Rows */
  #aurelix-ui .ax-target-row, #aurelix-ui .ax-potion-row, #aurelix-ui .ax-skill-row, #aurelix-ui .ax-assignment-row, #aurelix-ui .ax-preset-card { display: grid; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--ax-line); border-radius: 8px; background: rgba(0,0,0,0.2); margin-bottom: 8px; transition: border-color 0.2s; }
  #aurelix-ui .ax-target-row { grid-template-columns: 24px minmax(0,1fr) 140px 240px; }
  #aurelix-ui .ax-potion-row { grid-template-columns: minmax(0,1fr) 120px 100px; }
  #aurelix-ui .ax-skill-row { grid-template-columns: 42px minmax(0,1fr) auto; }
  #aurelix-ui .ax-assignment-row { grid-template-columns: minmax(180px,1fr) minmax(150px,0.75fr) minmax(150px,0.75fr); }
  #aurelix-ui .ax-assignment-row > div { min-width: 0; }
  #aurelix-ui .ax-assignment-row strong { display: block; color: #fff; font-size: calc(13px * var(--ax-scale)); font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
  #aurelix-ui .ax-assignment-row small { display: block; color: #9fb2ca; font-size: calc(11px * var(--ax-scale)); font-weight: 600; margin-top: 5px; line-height: 1.35; }
  #aurelix-ui .ax-assignment-row.is-target-enabled { border-color: rgba(56,189,248,.48); background: rgba(56,189,248,.055); }
  #aurelix-ui .ax-preset-card { grid-template-columns: minmax(0,1fr) auto; }
  #aurelix-ui .ax-preset-card.is-active { border: 2px solid var(--ax-cyan); background: color-mix(in srgb, var(--ax-cyan) 9%, rgba(0,0,0,.24)); box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 0 16px color-mix(in srgb, var(--ax-cyan) 38%, transparent); }

  #aurelix-ui .ax-target-row.is-selected { border-color: var(--ax-cyan); background: rgba(56, 189, 248, 0.05); }
  #aurelix-ui .ax-target-check, #aurelix-ui .ax-skill-check { width: 18px; height: 18px; cursor: pointer; accent-color: var(--ax-cyan); }

  #aurelix-ui .ax-target-row strong, #aurelix-ui .ax-potion-name strong { display: block; color: #fff; font-size: calc(14px * var(--ax-scale)); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #aurelix-ui .ax-target-row small, #aurelix-ui .ax-potion-name small { display: block; color: var(--ax-muted); font-size: calc(11px * var(--ax-scale)); margin-top: 4px; }

  #aurelix-ui .ax-phase-limits { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  #aurelix-ui .ax-phase-limit-box { display: grid; gap: 4px; }
  #aurelix-ui .ax-phase-limit-box span { color: var(--ax-muted); font-size: calc(10px * var(--ax-scale)); font-weight: 600; text-align: center; }

  #aurelix-ui .ax-target-skill-btn { padding: 8px; border-radius: 6px; border: 1px solid var(--ax-line); background: rgba(0,0,0,0.3); color: var(--ax-muted); font-family: inherit; font-size: calc(11px * var(--ax-scale)); font-weight: 600; cursor: pointer; transition: all 0.2s; }
  #aurelix-ui .ax-target-skill-btn.on { border-color: var(--ax-gold); color: var(--ax-gold); background: rgba(251, 191, 36, 0.1); }

  /* Misc Components */
  #aurelix-ui .ax-skill-icon { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; border: 1px solid var(--ax-line); background: rgba(0,0,0,0.3); }
  #aurelix-ui .ax-skill-copy strong { font-size: calc(14px * var(--ax-scale)); }
  #aurelix-ui .ax-skill-copy small { font-size: calc(11px * var(--ax-scale)); color: var(--ax-muted); }
  #aurelix-ui .ax-skill-kind { font-size: calc(10px * var(--ax-scale)); font-weight: 700; color: var(--ax-gold); text-transform: uppercase; margin-left: 8px; }

  #aurelix-ui .ax-mode-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  #aurelix-ui .ax-theme-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
  #aurelix-ui .ax-theme { min-height: 40px; border-radius: 6px; border: 1px solid var(--ax-line); color: #fff; font-family: inherit; font-weight: 600; font-size: calc(11px * var(--ax-scale)); cursor: pointer; transition: transform 0.2s; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
  #aurelix-ui .ax-theme.active { border: 2px solid #fff; box-shadow: 0 0 10px rgba(255,255,255,0.3); }

  #aurelix-ui .ax-preset-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  #aurelix-ui .ax-preset-name-input { flex: 1; min-width: 150px; }
  #aurelix-ui .ax-mini-action { padding: 8px 12px; border: 1px solid var(--ax-line); border-radius: 6px; background: rgba(0,0,0,0.3); color: var(--ax-text); font-family: inherit; font-size: calc(12px * var(--ax-scale)); font-weight: 600; cursor: pointer; transition: background 0.2s; }
  #aurelix-ui .ax-mini-action:hover { background: rgba(255,255,255,0.08); }
  #aurelix-ui .ax-mini-action.danger { color: var(--ax-red); }

  /* Pet Builder */
  #aurelix-ui .ax-pet-formation { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  #aurelix-ui .ax-pet-slot { padding: 12px; border: 1px solid var(--ax-line); border-radius: 8px; background: rgba(0,0,0,0.2); }
  #aurelix-ui .ax-pet-choice { width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px; border: 1px dashed var(--ax-line-strong); border-radius: 6px; background: transparent; color: var(--ax-text); cursor: pointer; text-align: left; min-height: 54px; margin-top: 6px; }
  #aurelix-ui .ax-pet-choice:hover { border-style: solid; background: rgba(255,255,255,0.05); }
  #aurelix-ui .ax-pet-choice img { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; }
  #aurelix-ui .ax-pet-link-label { margin-top: 12px; font-size: calc(10px * var(--ax-scale)); font-weight: 700; color: var(--ax-muted); }

  #aurelix-ui .ax-pet-picker { position: absolute; inset: 20px; z-index: 30; display: none; padding: 20px; border-radius: 12px; border: 1px solid var(--ax-line-strong); background: var(--ax-bg); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); overflow-y: auto; backdrop-filter: blur(12px); }
  #aurelix-ui .ax-pet-picker.open { display: block; animation: fadeIn 0.15s ease-out; }
  #aurelix-ui .ax-pet-picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
  #aurelix-ui .ax-pet-picker-item { padding: 8px; border: 1px solid var(--ax-line); border-radius: 6px; background: rgba(0,0,0,0.2); color: var(--ax-text); cursor: pointer; transition: all 0.2s; }
  #aurelix-ui .ax-pet-picker-item:hover { border-color: var(--ax-cyan); background: rgba(255,255,255,0.08); transform: translateY(-2px); }
  #aurelix-ui .ax-pet-picker-item img { width: 100%; aspect-ratio: 1; border-radius: 4px; object-fit: cover; margin-bottom: 8px; }

  /* Logs */
  #aurelix-ui .ax-logs { height: 430px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid var(--ax-line); border-radius: 8px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: calc(12px * var(--ax-scale)); }
  #aurelix-ui .ax-log-line { display: grid; grid-template-columns: 75px 85px 1fr; gap: 12px; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  #aurelix-ui .ax-log-time { color: var(--ax-muted); }
  #aurelix-ui .ax-log-type { font-weight: 700; text-transform: uppercase; }
  #aurelix-ui .ax-log-system { color: var(--ax-cyan); } #aurelix-ui .ax-log-error { color: var(--ax-red); } #aurelix-ui .ax-log-warning { color: var(--ax-orange); } #aurelix-ui .ax-log-success, #aurelix-ui .ax-log-start { color: var(--ax-green); } #aurelix-ui .ax-log-attack { color: var(--ax-gold); }

  /* Theme Swatches */
  #aurelix-ui .ax-theme[data-theme="crimsonCore"] { background: linear-gradient(120deg,#1a0304,#ff3027,#ff8b2d,#ffd148); }
  #aurelix-ui .ax-theme[data-theme="aegis"] { background: linear-gradient(120deg,#06192b,#2ce8ff,#3f7dff,#ffc84e); }
  #aurelix-ui .ax-theme[data-theme="abyss"] { background: linear-gradient(120deg,#0c0621,#24efff,#6654ff,#bf43ff,#ff3fc7); }
  #aurelix-ui .ax-theme[data-theme="royal"] { background: linear-gradient(120deg,#210c31,#7d72ff,#db54ff,#ffcc49); }
  #aurelix-ui .ax-theme[data-theme="forge"] { background: linear-gradient(120deg,#321006,#ff5e34,#ff9b39,#ffd64a,#4ebfff); }
  #aurelix-ui .ax-theme[data-theme="emerald"] { background: linear-gradient(120deg,#05271d,#35efc7,#28d9ff,#4f82ff,#ffd55f); }
  #aurelix-ui .ax-theme[data-theme="nova"] { background: linear-gradient(120deg,#320b19,#ff416f,#ff7c42,#b44cff,#49cfff); }
  #aurelix-ui .ax-theme[data-theme="cyberpunk"] { background: linear-gradient(120deg,#0d0208,#00ffcc,#ff00ff,#fcee0a); }
  #aurelix-ui .ax-theme[data-theme="frostbite"] { background: linear-gradient(120deg,#010a15,#0088ff,#00e5ff,#ffffff); }
  #aurelix-ui .ax-theme[data-theme="voidglitch"] { background: linear-gradient(120deg,#05000a,#cc00ff,#39ff14,#ff003c); }
  #aurelix-ui .ax-theme[data-theme="aurora"] { background: linear-gradient(120deg,#04151b,#2dd4bf,#8b5cf6,#f9e27d); }
  #aurelix-ui .ax-theme[data-theme="solarFlare"] { background: linear-gradient(120deg,#260b05,#ef4444,#fb923c,#fde047); }
  #aurelix-ui .ax-theme[data-theme="obsidianGold"] { background: linear-gradient(120deg,#030303,#6b5714,#eab308,#fff1a8); }
  #aurelix-ui .ax-theme[data-theme="sakuraNight"] { background: linear-gradient(120deg,#1d0b1b,#f472b6,#818cf8,#fbcfe8); }
  #aurelix-ui .ax-theme[data-theme="pitchBlack"] { background:linear-gradient(120deg,#000,#00e5ff,#ffe45c); }
  #aurelix-ui .ax-theme[data-theme="toxicMatrix"] { background:linear-gradient(120deg,#010702,#39ff14,#f4ff81); }
  #aurelix-ui .ax-theme[data-theme="inferno"] { background:linear-gradient(120deg,#120100,#ff2d00,#ffe600); }
  #aurelix-ui .ax-theme[data-theme="spectralGlass"] { background:linear-gradient(120deg,rgba(2,8,18,.9),#66e8ff,#c779ff,#ffe187); }
  #aurelix-ui .ax-theme[data-theme="neonNoir"] { background:linear-gradient(120deg,#020305,#00f5ff,#d946ef,#f8ff72); }
  #aurelix-ui .ax-theme[data-theme="deepOcean"] { background:linear-gradient(120deg,#001018,#00a9c7,#47ffe2,#8b9cff); }
  #aurelix-ui .ax-theme[data-theme="bloodMoon"] { background:linear-gradient(120deg,#120207,#ff295c,#e85dff,#ffd166); }
  #aurelix-ui .ax-theme[data-theme="ultraviolet"] { background:linear-gradient(120deg,#080312,#7c3aed,#ff4fd8,#ffe66d); }

  /* Utilities */
  #aurelix-ui .ax-footer { padding: 12px 20px; border-top: 1px solid var(--ax-line); background: var(--ax-header-bg); display: flex; justify-content: space-between; color: var(--ax-muted); font-size: calc(12px * var(--ax-scale)); }
  #aurelix-ui .ax-panel-scan { display: none; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(0,0,0,0.3); border: 1px solid var(--ax-line); }
  #aurelix-ui .ax-panel-scan.show { display: flex; }
  #aurelix-ui .ax-scan-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--ax-cyan); border-radius: 50%; animation: axScanSpin 0.8s linear infinite; }
  @keyframes axScanSpin { to { transform: rotate(360deg); } }

  /* ROCKET STYLING & ANIMATIONS */
  #aurelix-mini { position: fixed; right: 20px; top: 50%; transform: translateY(-50%); width: 56px; height: 66px; border: 0; border-radius: 0; background: transparent; backdrop-filter: none; display: none; place-items: center; cursor: pointer; z-index: 2147483001; box-shadow: none; }
  #aurelix-mini.show { display: flex; align-items:center; justify-content:center; }
  #aurelix-mini:hover .ax-rocket { filter:drop-shadow(0 8px 9px rgba(0,0,0,.74)) drop-shadow(0 0 12px var(--ax-cyan)); }

  #aurelix-mini .ax-rocket { position:relative; width:34px; height:52px; display:block; pointer-events:none; transform-origin:50% 72%; filter:drop-shadow(0 7px 8px rgba(0,0,0,.72)) drop-shadow(0 0 8px rgba(255,69,38,.22)); }
  #aurelix-mini .ax-rocket-body { position:absolute; z-index:3; left:7px; top:2px; width:20px; height:37px; border:1px solid rgba(255,213,103,.92); border-radius:52% 52% 38% 38% / 66% 66% 27% 27%; background: linear-gradient(90deg,rgba(255,255,255,.28),transparent 24%,transparent 72%,rgba(0,0,0,.26)), linear-gradient(180deg,#ffca54 0 7%,#cf321f 8% 43%,#7c1012 72%,#270407 100%); box-shadow:inset 0 0 0 1px rgba(255,66,39,.25),0 0 8px rgba(255,70,35,.18); }
  #aurelix-mini .ax-rocket-body::before { content:''; position:absolute; left:50%; top:8px; width:8px; height:8px; transform:translateX(-50%); border-radius:50%; border:1px solid rgba(255,231,149,.95); background:radial-gradient(circle at 38% 32%,#f6fbff 0 10%,#5edbff 23%,#1766a5 63%,#071522 100%); box-shadow:0 0 5px rgba(79,204,255,.72),inset 0 0 2px rgba(255,255,255,.8); }
  #aurelix-mini .ax-rocket-body::after { content:'A'; position:absolute; left:50%; top:20px; transform:translateX(-50%); font-family:"Cinzel","Trajan Pro","Times New Roman",serif; font-size:9px; line-height:1; font-weight:900; color:#ffe28c; text-shadow:0 0 3px rgba(255,201,70,.55); }
  #aurelix-mini .ax-rocket-fin { position:absolute; z-index:2; top:28px; width:9px; height:16px; background:linear-gradient(180deg,#e74327,#650b0e 72%,#240305); border:1px solid rgba(255,181,69,.65); }
  #aurelix-mini .ax-rocket-fin.ax-left { left:2px; clip-path:polygon(100% 0,100% 100%,0 86%,25% 34%); }
  #aurelix-mini .ax-rocket-fin.ax-right { right:2px; clip-path:polygon(0 0,0 100%,100% 86%,75% 34%); }
  #aurelix-mini .ax-rocket-nozzle { position:absolute; z-index:4; left:12px; top:37px; width:10px; height:5px; border-radius:1px 1px 4px 4px; background:linear-gradient(90deg,#54201b,#d87931 50%,#54201b); border:1px solid rgba(255,197,91,.55); }
  #aurelix-mini .ax-rocket-flame { position:absolute; z-index:1; left:50%; top:40px; width:13px; height:20px; transform:translateX(-50%) scaleY(.12); transform-origin:50% 0; opacity:0; clip-path:polygon(50% 100%,8% 18%,30% 0,50% 16%,70% 0,92% 18%); background:radial-gradient(ellipse at 50% 5%,#fffbd0 0 16%,#ffd852 17% 34%,#ff7a24 47% 68%,#ec271b 76%,transparent 100%); filter:drop-shadow(0 4px 4px rgba(255,70,20,.75)) drop-shadow(0 9px 8px rgba(255,164,23,.38)); transition:opacity .15s ease,transform .15s ease; }

  #aurelix-mini.ax-running .ax-rocket { animation:axRocketThrust .46s ease-in-out infinite alternate; filter:drop-shadow(0 8px 9px rgba(0,0,0,.74)) drop-shadow(0 0 10px rgba(255,75,34,.42)); }
  #aurelix-mini.ax-running .ax-rocket-flame { opacity:1; transform:translateX(-50%) scaleY(1); animation:axRocketFlame .18s ease-in-out infinite alternate; }

  @keyframes axRocketThrust { 0% { transform:translateY(1px) rotate(-.45deg); } 100% { transform:translateY(-2px) rotate(.45deg); } }
  @keyframes axRocketFlame { 0% { height:17px; width:11px; opacity:.82; } 100% { height:25px; width:15px; opacity:1; } }

  /* Responsive */
  @media (max-width: 860px) {
    #aurelix-ui { left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0 !important; width: 100% !important; height: 100% !important; min-width: 0 !important; min-height: 0 !important; transform: none !important; border-radius: 0; backdrop-filter:none; contain:layout paint style; }
    #aurelix-ui .ax-header { cursor: default; }
    #aurelix-ui .ax-overview { grid-template-columns: 1fr; }
    #aurelix-ui .ax-target-body { grid-template-columns: 1fr; }
    #aurelix-ui .ax-monster-image-wrap { max-width: 260px; margin: 0 auto 16px auto; }
    #aurelix-ui .ax-target-row { grid-template-columns: 24px 1fr; }
    #aurelix-ui .ax-target-row .ax-target-skill-btn, #aurelix-ui .ax-target-row .ax-phase-limits, #aurelix-ui .ax-target-row .ax-target-limit { grid-column: 1 / -1; }
    #aurelix-ui .ax-assignment-row { grid-template-columns: 1fr; }
    #aurelix-ui .ax-content { padding: 10px; overscroll-behavior: contain; }
    #aurelix-ui .ax-card-pad { padding: 12px; }
    #aurelix-ui .ax-nav-btn { min-height: 52px; padding: 0 14px; }
    #aurelix-ui .ax-num, #aurelix-ui .ax-search, #aurelix-ui .ax-select, #aurelix-ui button { font-size: 16px; touch-action: manipulation; }
    #aurelix-ui .ax-pet-formation { grid-template-columns: 1fr; }
    #aurelix-ui .ax-preset-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; }
    #aurelix-ui .ax-theme-grid { grid-template-columns: repeat(3, 1fr); }
    #aurelix-mini { right: 20px; bottom: 20px; top: auto; transform: none; }
  }
  @media (max-width: 860px) and (prefers-reduced-motion: reduce) {
    #aurelix-ui *:not(.ax-scan-spinner), #aurelix-mini * { animation:none !important; transition:none !important; }
  }
  `;

  // --- HTML & JAVASCRIPT LOGIC REMAINS EXACTLY AS ORIGINAL ---
  const host = document.createElement('div');
  host.id = 'aurelix-host';
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483646';
  host.style.pointerEvents = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);
  const root = document.createElement('div');
  root.id = 'aurelix-ui';
  root.dataset.theme = DEFAULTS.theme;
  root.innerHTML = `
    <div class="ax-shell">
      <header class="ax-header" id="ax-drag">
        <div class="ax-brand">
          <span class="ax-brand-main">Aurelix Auto Engine</span>
          <span class="ax-version">v${VERSION}</span>
        </div>
        <div class="ax-window-actions">
          <div class="ax-panel-scan" id="ax-panel-scan" aria-live="polite">
            <span class="ax-scan-spinner"></span>
            <span class="ax-panel-scan-text" style="font-size:11px; font-weight:700;">SCANNING</span>
          </div>
          <button class="ax-save-btn" id="ax-save-settings" type="button" title="Save all AURELIX settings">💾 Save Config</button>
          <button class="ax-icon-btn" id="ax-minimize" aria-label="Minimize">—</button>
        </div>
      </header>
     <nav class="ax-nav">
  <button class="ax-nav-btn active" data-view="overview">🌌 Overview</button>
  <button class="ax-nav-btn" data-view="combat">⚔️ Combat</button>
  <button class="ax-nav-btn" data-view="resources">🧪 Resources</button>
  <button class="ax-nav-btn" data-view="targets">🎯 Targets</button>
  <button class="ax-nav-btn" data-view="presets">🎒 Presets</button>
  <button class="ax-nav-btn" data-view="settings">🛠️ Settings</button>
  <button class="ax-nav-btn" data-view="updates">🚀 Updates</button>
  <button class="ax-nav-btn" data-view="logs">📟 Logs</button>
</nav>
      <main class="ax-content">
        <section class="ax-view active" data-view="overview">
          <div class="ax-overview">
            <div>
              <article class="ax-card">
                <div class="ax-card-head">
                  <h3>🎯 Current Target</h3>
                  <span class="ax-status" id="ax-target-status" style="color:var(--ax-muted); font-size:12px;">Waiting</span>
                </div>
                <div class="ax-target-body">
                  <div class="ax-monster-image-wrap">
                    <img id="ax-monster-image" class="ax-monster-image" alt="">
                    <div class="ax-monster-placeholder">🎯</div>
                  </div>
                  <div class="ax-target-info">
                    <div class="ax-target-name" id="ax-target-name">No active target</div>
                    <div class="ax-target-meta-grid">
                      <div class="ax-meta-label">Source</div>
                      <div class="ax-meta-value" id="ax-target-source">—</div>
                      <div class="ax-meta-label">🌌 Gate</div>
                      <div class="ax-meta-value" id="ax-target-gate">—</div>
                      <div class="ax-meta-label">🌊 Wave</div>
                      <div class="ax-meta-value" id="ax-target-wave">—</div>
                      <div class="ax-meta-label">🏰 Dungeon</div>
                      <div class="ax-meta-value" id="ax-target-dungeon">—</div>
                      <div class="ax-meta-label">🗺️ Location</div>
                      <div class="ax-meta-value" id="ax-target-location">—</div>
                    </div>
                    <div class="ax-hp-block">
                      <div class="ax-resource-label-row">
                        <strong id="ax-target-damage-label">Damage Progress</strong>
                        <span id="ax-target-hp">—</span>
                      </div>
                      <div class="ax-bar ax-bar-hp"><i id="ax-target-hp-fill"></i></div>
                    </div>
                  </div>
                </div>
              </article>
              <article class="ax-card ax-player-card">
                <div class="ax-card-head">
                  <h3>🧬 Player Resources</h3>
                </div>
                <div class="ax-card-pad" style="display:grid; gap:16px;">
                  <div>
                    <div class="ax-resource-label-row">
                      <strong>Stamina</strong>
                      <span id="ax-stamina-text">—</span>
                    </div>
                    <div class="ax-bar ax-bar-stamina"><i id="ax-stamina-fill"></i></div>
                  </div>
                  <div>
                    <div class="ax-resource-label-row">
                      <strong>Experience</strong>
                      <span id="ax-exp-text">—</span>
                    </div>
                    <div class="ax-bar ax-bar-exp"><i id="ax-exp-fill"></i></div>
                  </div>
                </div>
              </article>
              <article class="ax-card ax-current-action" style="margin-top:16px;">
                <div class="ax-card-head">
                  <h3>⚡ Current Action</h3>
                </div>
                <div class="ax-action-body">
                  <div class="ax-action-main">
                    <strong id="ax-action-title">Idle</strong>
                    <span id="ax-action-detail">—</span>
                  </div>
                  <button class="ax-engine-button" id="ax-engine-toggle">🚀 Start Engine</button>
                </div>
              </article>
            </div>
            <article class="ax-card ax-summary">
              <div class="ax-card-head">
                <h3>📊 Session Summary</h3>
              </div>
              <div class="ax-summary-body">
                <div class="ax-summary-row"><span>Runtime</span><b id="ax-sum-runtime">00:00:00</b></div>
                <div class="ax-summary-row"><span>Targets Completed</span><b id="ax-sum-completed">0</b></div>
                <div class="ax-summary-row"><span>Total Attacks</span><b id="ax-sum-attacks">0</b></div>
                <div class="ax-summary-row"><span>Total Damage</span><b id="ax-sum-damage">0</b></div>
                <div class="ax-summary-row"><span>Stamina Used</span><b id="ax-sum-stamina">0</b></div>
                <div class="ax-summary-row"><span>Potions Used</span><b id="ax-sum-potions">0</b></div>
                <div class="ax-summary-row"><span>HP Potions</span><b id="ax-sum-hp-potions">0</b></div>
                <div class="ax-summary-row"><span>Stamina Potions</span><b id="ax-sum-stamina-potions">0</b></div>
                <div class="ax-summary-row"><span>Mana Potions</span><b id="ax-sum-mana-potions">0</b></div>
                <div class="ax-summary-row"><span>Mobs Looted</span><b id="ax-sum-mobs-looted">0</b></div>
                <div class="ax-summary-row"><span>Mobs Unlooted</span><b id="ax-sum-mobs-unlooted">0</b></div>
                <div class="ax-summary-row"><span>XP Looted</span><b id="ax-sum-xp-loot">0</b></div>
                <div class="ax-summary-row"><span>Errors</span><b id="ax-sum-errors" style="color:var(--ax-red)">0</b></div>
              </div>
            </article>
          </div>
        </section>
        <section class="ax-view" data-view="combat">
          <div style="display:grid; gap:16px;">
            <article class="ax-card">
              <div class="ax-card-head"><h3>⚙️ Automation Mode</h3></div>
              <div class="ax-card-pad">
                <div class="ax-mode-grid" id="ax-mode-grid">
                  <button class="ax-choice-btn active" data-mode="full">Full Auto</button>
                  <button class="ax-choice-btn" data-mode="gate">Gates Only</button>
                  <button class="ax-choice-btn" data-mode="dungeon">Dungeons Only</button>
                </div>
              </div>
            </article>
            <article class="ax-card">
              <div class="ax-card-head"><h3>✨ Active Skills</h3></div>
              <div class="ax-card-pad">
                <div class="ax-skill-list" id="ax-active-skills">
                  <div class="ax-setting-copy"><small>Discovering active skills from the battle server…</small></div>
                </div>
              </div>
            </article>
            <article class="ax-card">
              <div class="ax-card-head"><h3>🎁 Loot</h3></div>
              <div class="ax-card-pad">
                <div class="ax-setting-row">
                  <div class="ax-setting-copy">
                    <strong>Auto Loot</strong>
                  </div>
                  <div class="ax-toggle on" id="ax-auto-loot"></div>
                </div>
                <div class="ax-setting-row" style="display:block">
                  <div class="ax-setting-copy">
                    <strong>EXP Threshold</strong>
                    <small>Auto Loot activates when remaining EXP reaches this threshold.</small>
                  </div>
                  <div style="display:grid; grid-template-columns: 1fr 70px; gap: 12px; align-items: center; margin-top: 10px;">
                    <input class="ax-range" id="ax-exp-threshold" type="range" min="1" max="99" value="20">
                    <input class="ax-num" id="ax-exp-threshold-num" type="number" min="1" max="99" value="20">
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
        <section class="ax-view" data-view="resources">
          <div style="display:grid; gap:16px;">
            <article class="ax-card">
              <div class="ax-card-head"><h3>⚡ Stamina Potions</h3></div>
              <div class="ax-card-pad">
                <div class="ax-potions" id="ax-stamina-potions"></div>
              </div>
            </article>
            <article class="ax-card">
              <div class="ax-card-head"><h3>💧 Mana Potions</h3></div>
              <div class="ax-card-pad">
                <div class="ax-potions" id="ax-mana-potions"></div>
              </div>
            </article>
            <article class="ax-card">
              <div class="ax-card-head"><h3>❤️ HP Potions</h3></div>
              <div class="ax-card-pad">
                <div class="ax-potions" id="ax-hp-potions"></div>
              </div>
            </article>
          </div>
        </section>
        <section class="ax-view" data-view="targets">
          <div style="display:grid; gap:16px;">
            <article class="ax-card">
              <div class="ax-card-pad">
                <div style="display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; margin-bottom:16px;">
                  <input class="ax-search" id="ax-target-search" type="search" placeholder="🔍 Search bosses or generals...">
                  <select class="ax-select" id="ax-target-filter" style="width:140px;">
                    <option value="all">All Sources</option>
                    <option value="gate">🚪 Gates</option>
                    <option value="dungeon">🏰 Dungeons</option>
                  </select>
                </div>
                <div id="ax-target-list"></div>
              </div>
            </article>
          </div>
        </section>
        <section class="ax-view" data-view="presets">
          <div style="display:grid; gap:16px;">
            <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:12px;">
              <button class="ax-choice-btn active" data-preset-subview="manager" type="button">🎒 Preset Manager</button>
              <button class="ax-choice-btn" data-preset-subview="assignments" type="button">🎯 Monster Assignments</button>
            </div>
            <div class="ax-preset-subview active" data-preset-panel="manager">
            <article class="ax-card">
              <div class="ax-card-head"><h3>🛠️ Loadout Controller</h3></div>
              <div class="ax-card-pad">
                <div class="ax-preset-toolbar">
                  <button class="ax-mini-action" id="ax-sync-presets" type="button">↻ Import Existing Presets</button>
                  <button class="ax-mini-action" id="ax-detect-loadout" type="button">🔍 Detect Equipped</button>
                  <span id="ax-loadout-status" style="margin-left:auto; color:var(--ax-muted); font-size:12px;">Preset controller ready</span>
                </div>
              </div>
            </article>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:12px; margin-top:16px;">
              <article class="ax-card">
                <div class="ax-card-head"><h3>⚔️ Equipment + Crystals</h3></div>
                <div class="ax-card-pad">
                  <div class="ax-preset-toolbar" style="margin-bottom:16px">
                    <input class="ax-search ax-preset-name-input" id="ax-equipment-preset-name" maxlength="40" placeholder="New equipment preset name">
                    <button class="ax-mini-action" id="ax-save-equipment-preset" type="button">➕ Save Equipped</button>
                  </div>
                  <div id="ax-equipment-presets"></div>
                </div>
              </article>
              <article class="ax-card">
                <div class="ax-card-head"><h3>🐾 Pet Formation</h3></div>
                <div class="ax-card-pad">
                  <div class="ax-preset-toolbar" style="margin-bottom:16px">
                    <button class="ax-mini-action" id="ax-new-pet-preset" type="button">➕ Create Preset</button>
                    <input class="ax-search ax-preset-name-input" id="ax-pet-preset-name" maxlength="40" placeholder="Equipped preset name">
                    <button class="ax-mini-action" id="ax-save-pet-preset" type="button">➕ Save Equipped</button>
                  </div>
                  <div id="ax-pet-presets"></div>
                </div>
              </article>
            </div>
            <article class="ax-card" id="ax-pet-builder-card" style="display:none; margin-top:16px;">
              <div class="ax-card-head"><h3>🐾 Pet Formation Builder</h3><span id="ax-pet-builder-mode" style="color:var(--ax-muted); font-size:12px;">NEW</span></div>
              <div class="ax-card-pad ax-pet-builder">
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:16px;">
                  <input class="ax-search ax-preset-name-input" id="ax-pet-builder-name" maxlength="40" placeholder="Pet preset name">
                  <button class="ax-mini-action" id="ax-pet-builder-cancel" type="button">❌ Cancel</button>
                  <button class="ax-mini-action" id="ax-pet-builder-save" type="button" style="color:var(--ax-green); border-color:var(--ax-green);">✅ Save Formation</button>
                </div>
                <div class="ax-pet-formation" id="ax-pet-formation"></div>
              </div>
            </article>
            </div>
            <div class="ax-preset-subview" data-preset-panel="assignments">
            <article class="ax-card">
              <div class="ax-card-head"><h3>🎯 Monster Assignments</h3></div>
              <div class="ax-card-pad">
                <div class="ax-setting-copy" style="margin-bottom:16px"><small>Keep Current leaves that part of the equipped loadout unchanged. AURELIX groups matching assignments to minimize switches.</small></div>
                <div class="ax-preset-toolbar">
                  <input class="ax-search" id="ax-assignment-search" placeholder="🔍 Search any monster, Gate, Wave or Dungeon">
                  <select class="ax-select" id="ax-assignment-filter" style="max-width:180px">
                    <option value="all">All Monsters</option>
                    <option value="enabled">Enabled Targets</option>
                    <option value="gate">Gate Monsters</option>
                    <option value="dungeon">Dungeon Monsters</option>
                  </select>
                </div>
                <div id="ax-loadout-assignments"></div>
              </div>
            </article>
            </div>
            <div class="ax-pet-picker" id="ax-pet-picker">
              <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                <strong id="ax-pet-picker-title">Select Pet</strong>
                <input class="ax-search ax-preset-name-input" id="ax-pet-picker-search" placeholder="🔍 Search pet name or ID">
                <button class="ax-mini-action" id="ax-pet-picker-close" type="button" style="margin-left:auto;">❌ Close</button>
              </div>
              <div class="ax-pet-picker-grid" id="ax-pet-picker-grid"></div>
            </div>
          </div>
        </section>
        <section class="ax-view" data-view="settings">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
            <article class="ax-card">
              <div class="ax-card-head"><h3>📐 Panel Size</h3></div>
              <div class="ax-card-pad">
                <div style="display:grid; gap:16px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label for="ax-size-width" style="color:var(--ax-muted)">Width</label>
                    <input class="ax-range" id="ax-size-width" type="range" min="760" max="1320" step="10" style="width:50%">
                    <output id="ax-size-width-out" style="color:var(--ax-gold); font-family:monospace;"></output>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label for="ax-size-height" style="color:var(--ax-muted)">Height</label>
                    <input class="ax-range" id="ax-size-height" type="range" min="540" max="920" step="10" style="width:50%">
                    <output id="ax-size-height-out" style="color:var(--ax-gold); font-family:monospace;"></output>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label for="ax-size-scale" style="color:var(--ax-muted)">UI Scale</label>
                    <input class="ax-range" id="ax-size-scale" type="range" min="90" max="135" step="5" style="width:50%">
                    <output id="ax-size-scale-out" style="color:var(--ax-gold); font-family:monospace;"></output>
                  </div>
                </div>
              </div>
            </article>
            <article class="ax-card">
              <div class="ax-card-head"><h3>✨ Theme & Effects</h3></div>
              <div class="ax-card-pad">
                <div class="ax-theme-grid">
                  <button class="ax-theme active" data-theme="aegis">Aegis</button>
                  <button class="ax-theme" data-theme="cyberpunk">Cyberpunk</button>
                  <button class="ax-theme" data-theme="frostbite">Frostbite</button>
                  <button class="ax-theme" data-theme="voidglitch">Glitch</button>
                  <button class="ax-theme" data-theme="aurora">Aurora</button>
                  <button class="ax-theme" data-theme="solarFlare">Solar Flare</button>
                  <button class="ax-theme" data-theme="obsidianGold">Obsidian Gold</button>
                  <button class="ax-theme" data-theme="sakuraNight">Sakura Night</button>
                  <button class="ax-theme" data-theme="pitchBlack">Pitch Black</button>
                  <button class="ax-theme" data-theme="toxicMatrix">Toxic Matrix</button>
                  <button class="ax-theme" data-theme="inferno">Inferno</button>
                  <button class="ax-theme" data-theme="spectralGlass">Spectral Glass</button>
                  <button class="ax-theme" data-theme="neonNoir">Neon Noir</button>
                  <button class="ax-theme" data-theme="deepOcean">Deep Ocean</button>
                  <button class="ax-theme" data-theme="bloodMoon">Blood Moon</button>
                  <button class="ax-theme" data-theme="ultraviolet">Ultraviolet</button>
                </div>
                <div class="ax-setting-row" style="margin-top:20px;">
                  <div class="ax-setting-copy"><strong>Visual Effects</strong><small>Disable for low-end device safety.</small></div>
                  <div class="ax-toggle" id="ax-effects-toggle"></div>
                </div>
              </div>
            </article>
          </div>
        </section>
        <section class="ax-view" data-view="updates">

  <div class="ax-card">
    <div class="ax-card-head">
      <div>
        <div class="ax-card-title">🚀 AURELIX Update Center</div>
        <div class="ax-card-sub">
          Check for new AURELIX releases and install updates.
        </div>
      </div>

      <div class="ax-badge" id="ax-update-badge">
        NOT CHECKED
      </div>
    </div>

    <div class="ax-card-pad">

      <div class="ax-update-version-grid">

        <div class="ax-update-version-box">
          <div class="ax-update-label">
            INSTALLED VERSION
          </div>

          <div class="ax-update-version" id="ax-update-current">
            —
          </div>
        </div>

        <div class="ax-update-arrow">
          →
        </div>

        <div class="ax-update-version-box">
          <div class="ax-update-label">
            LATEST VERSION
          </div>

          <div class="ax-update-version" id="ax-update-latest">
            —
          </div>
        </div>

      </div>


      <div class="ax-update-status" id="ax-update-status">
        <div class="ax-update-status-icon">◌</div>

        <div>
          <div class="ax-update-status-title">
            Update status not checked
          </div>

          <div class="ax-update-status-sub">
            Check GitHub for the latest stable AURELIX release.
          </div>
        </div>
      </div>


      <div class="ax-update-actions">

        <button
          type="button"
          class="ax-btn"
          id="ax-update-check"
        >
          🔍 Check Update
        </button>

        <button
          type="button"
          class="ax-btn"
          id="ax-update-install"
          disabled
        >
          🚀 Install Update
        </button>

      </div>

    </div>
  </div>


  <div class="ax-card">
    <div class="ax-card-head">
      <div>
        <div class="ax-card-title">📋 What's New</div>
        <div class="ax-card-sub" id="ax-update-release-info">
          Release information will appear after checking for updates.
        </div>
      </div>
    </div>

    <div class="ax-card-pad">

      <div
        class="ax-update-changelog"
        id="ax-update-changelog"
      >
        <div class="ax-update-empty">
          No release information loaded.
        </div>
      </div>

    </div>
  </div>


  <div class="ax-card">
    <div class="ax-card-head">
      <div>
        <div class="ax-card-title">⚡ Release Channel</div>
        <div class="ax-card-sub">
          AURELIX production update source
        </div>
      </div>
    </div>

    <div class="ax-card-pad">

      <div class="ax-update-details">

        <div>
          <span>Channel</span>
          <strong id="ax-update-channel">Stable</strong>
        </div>

        <div>
          <span>Last Checked</span>
          <strong id="ax-update-checked">Never</strong>
        </div>

        <div>
          <span>Author</span>
          <strong>Cosmic</strong>
        </div>

      </div>

    </div>
  </div>
   </section>
        <section class="ax-view" data-view="logs">
          <div class="ax-card">
            <div class="ax-card-head"><h3>📟 Activity Logs</h3></div>
            <div class="ax-card-pad"><div class="ax-logs" id="ax-logs"></div></div>
          </div>
        </section>
      </main>
      <footer class="ax-footer">
        <span id="ax-footer-left">AURELIX AUTO ENGINE</span>
        <span id="ax-footer-right">Scanner: waiting</span>
      </footer>
    </div>
/* =========================================================
   AURELIX UPDATE CENTER
   ========================================================= */

.ax-update-version-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.ax-update-version-box {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background:
    linear-gradient(
      145deg,
      rgba(255,255,255,.035),
      rgba(255,255,255,.012)
    );
  text-align: center;
}

.ax-update-label {
  margin-bottom: 7px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
  opacity: .58;
}

.ax-update-version {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: .4px;
}

.ax-update-arrow {
  font-size: 22px;
  font-weight: 900;
  opacity: .42;
}

.ax-update-status {
  display: flex;
  align-items: center;
  gap: 12px;

  padding: 13px 14px;
  margin-bottom: 14px;

  border: 1px solid var(--line);
  border-radius: 13px;

  background: rgba(255,255,255,.025);
}

.ax-update-status-icon {
  display: grid;
  place-items: center;

  width: 34px;
  height: 34px;

  flex: 0 0 34px;

  border-radius: 10px;
  border: 1px solid var(--line);

  font-size: 18px;
  font-weight: 900;
}

.ax-update-status-title {
  font-size: 12px;
  font-weight: 900;
}

.ax-update-status-sub {
  margin-top: 3px;
  font-size: 10px;
  line-height: 1.45;
  opacity: .58;
}

.ax-update-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.ax-update-actions .ax-btn {
  flex: 1 1 160px;
}

.ax-update-actions .ax-btn:disabled {
  opacity: .38;
  cursor: not-allowed;
  filter: grayscale(.35);
}

.ax-update-changelog {
  display: grid;
  gap: 8px;
}

.ax-update-change {
  position: relative;

  padding: 10px 12px 10px 30px;

  border: 1px solid var(--line);
  border-radius: 11px;

  background: rgba(255,255,255,.02);

  font-size: 11px;
  line-height: 1.5;
}

.ax-update-change::before {
  content: "✦";

  position: absolute;
  left: 11px;
  top: 10px;

  font-size: 10px;
  opacity: .7;
}

.ax-update-empty {
  padding: 14px;

  border: 1px dashed var(--line);
  border-radius: 11px;

  text-align: center;

  font-size: 11px;
  opacity: .5;
}

.ax-update-details {
  display: grid;
  gap: 8px;
}

.ax-update-details > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;

  padding: 10px 12px;

  border: 1px solid var(--line);
  border-radius: 10px;

  background: rgba(255,255,255,.018);
}

.ax-update-details span {
  font-size: 10px;
  opacity: .58;
}

.ax-update-details strong {
  font-size: 11px;
  font-weight: 850;
}

@media (max-width: 620px) {
  .ax-update-version-grid {
    grid-template-columns: 1fr;
  }

  .ax-update-arrow {
    transform: rotate(90deg);
    text-align: center;
  }
}
  `;
  const mini = document.createElement('button');
  mini.id = 'aurelix-mini';
  mini.type = 'button';
  mini.innerHTML = `
  <span class="ax-rocket" aria-hidden="true">
    <span class="ax-rocket-fin ax-left"></span>
    <span class="ax-rocket-fin ax-right"></span>
    <span class="ax-rocket-body"></span>
    <span class="ax-rocket-nozzle"></span>
    <span class="ax-rocket-flame"></span>
  </span>`;
  mini.setAttribute('aria-label', 'Restore AURELIX');
  root.style.pointerEvents = 'auto';
  mini.style.pointerEvents = 'auto';
  shadow.append(root, mini);
  document.body.appendChild(host);
  const $ = (s, scope = shadow) => scope.querySelector(s);
  const $$ = (s, scope = shadow) => [...scope.querySelectorAll(s)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || min));
  const fmt = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString() : '—';
  const pct = (a, b) => Number(b) > 0 ? clamp((Number(a) / Number(b)) * 100, 0, 100) : 0;
  const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const displayTargetName = value => String(value || 'Unknown Target')
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
  let scannerBusy = false;
  let appState = {
    mode: 'full',
    running: false,
    startedAt: 0,
    elapsedBeforeStop: 0,
    currentTarget: null,
    resources: {
      stamina: null, staminaMax: null,
      exp: null, expMax: null
    },
    summary: {
      completed: 0,
      attacks: 0,
      damage: 0,
      staminaUsed: 0,
      potions: 0,
      hpPotions: 0,
      staminaPotions: 0,
      manaPotions: 0,
      mobsLooted: 0,
      mobsUnlooted: 0,
      xpLooted: 0,
      errors: 0
    },
    targets: [],
    activeSkills: [],
    potions: {
      stamina: [],
      mana: [],
      hp: []
    },
    loadouts: {
      equipmentPresets: [],
      petPresets: [],
      assignments: {},
      active: { equipmentPresetId:null, petPresetId:null, detected:false },
      busy: false
    },
    logs: []
  };
  let petBuilder = null;
  let petBuilderSnapshot = null;
  let petPicker = null;
  function setBar(id, value) {
    const el = $(id);
    if (el) el.style.width = `${clamp(value,0,100)}%`;
  }
  function renderOverview() {
    const t = appState.currentTarget;
    const targetNameEl = $('#ax-target-name');
    targetNameEl.textContent = t?.name ? displayTargetName(t.name) : 'No active target';
    targetNameEl.classList.toggle('has-target', !!t?.name);
    $('#ax-target-status').textContent = t?.status || (appState.running ? 'Scanning' : 'Waiting');
    $('#ax-target-source').textContent = t?.source ? String(t.source).toUpperCase() : '—';
    $('#ax-target-gate').textContent = t?.gateName || t?.gate || '—';
    $('#ax-target-wave').textContent = t?.waveName || t?.wave || '—';
    $('#ax-target-dungeon').textContent = t?.dungeonName || t?.dungeon || '—';
    $('#ax-target-location').textContent = t?.locationName || t?.location || '—';
    const inPhase3 = t?.phaseStage === 'phase3';
    const cumulativeDamage = Number(t?.currentUserDamage ?? t?.userDamage);
    const phase3Baseline = Number(t?.phase3Baseline);
    const currentDamage = Number.isFinite(cumulativeDamage)
      ? Math.max(0, inPhase3 && Number.isFinite(phase3Baseline) ? cumulativeDamage - phase3Baseline : cumulativeDamage)
      : null;
    const limitDamage = inPhase3
      ? Number(t?.phase3DamageLimit)
      : Number(t?.phase1DamageLimit ?? t?.damageLimit);
    $('#ax-target-damage-label').textContent = inPhase3 ? 'Phase 3 Damage' : 'Damage Progress';
    $('#ax-target-hp').textContent = limitDamage > 0
      ? `${currentDamage == null ? 'Verifying…' : fmt(currentDamage)} / ${fmt(limitDamage)}`
      : '—';
    setBar('#ax-target-hp-fill', currentDamage != null && limitDamage > 0 ? pct(currentDamage, limitDamage) : 0);
    const img = $('#ax-monster-image');
    const imgUrl = t?.image || t?.imageUrl || t?.img || t?.monsterImage || '';
    img.onerror = () => {
      img.removeAttribute('src');
      img.classList.remove('visible');
    };
    if (imgUrl) {
      if (img.src !== imgUrl) img.src = imgUrl;
      img.alt = t?.name ? displayTargetName(t.name) : 'Target';
      img.classList.add('visible');
    } else {
      img.removeAttribute('src');
      img.classList.remove('visible');
    }
    const r = appState.resources;
    $('#ax-stamina-text').textContent = Number(r.staminaMax) > 0 ? `${fmt(r.stamina)} / ${fmt(r.staminaMax)}` : '—';
    $('#ax-exp-text').textContent = Number(r.expMax) > 0 ? `${fmt(r.exp)} / ${fmt(r.expMax)}` : '—';
    setBar('#ax-stamina-fill', pct(r.stamina, r.staminaMax));
    setBar('#ax-exp-fill', pct(r.exp, r.expMax));
    $('#ax-sum-completed').textContent = fmt(appState.summary.completed);
    $('#ax-sum-attacks').textContent = fmt(appState.summary.attacks);
    $('#ax-sum-damage').textContent = fmt(appState.summary.damage);
    $('#ax-sum-stamina').textContent = fmt(appState.summary.staminaUsed);
    $('#ax-sum-potions').textContent = fmt(appState.summary.potions);
    $('#ax-sum-hp-potions').textContent = fmt(appState.summary.hpPotions);
    $('#ax-sum-stamina-potions').textContent = fmt(appState.summary.staminaPotions);
    $('#ax-sum-mana-potions').textContent = fmt(appState.summary.manaPotions);
    $('#ax-sum-mobs-looted').textContent = fmt(appState.summary.mobsLooted);
    $('#ax-sum-mobs-unlooted').textContent = fmt(appState.summary.mobsUnlooted);
    $('#ax-sum-xp-loot').textContent = fmt(appState.summary.xpLooted);
    $('#ax-sum-errors').textContent = fmt(appState.summary.errors);

    const toggleBtn = $('#ax-engine-toggle');
    toggleBtn.textContent = appState.running ? '🛑 Stop Engine' : '🚀 Start Engine';
    toggleBtn.style.background = appState.running ? 'var(--ax-red)' : 'var(--ax-green)';
    toggleBtn.style.color = appState.running ? '#fff' : '#000';

    $('#ax-action-title').textContent = appState.running
      ? (t ? `🎯 Targeting ${t.name}` : '⌁ Scanning')
      : '⏸ Idle';
    $('#ax-action-detail').textContent = t?.actionDetail || '—';
  }
  function renderRuntime() {
    if (root.style.display === 'none') return;
    let ms = appState.elapsedBeforeStop || 0;
    if (appState.running && appState.startedAt) ms = Math.max(0, Date.now() - appState.startedAt);
    const sec = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(sec / 3600)).padStart(2,'0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2,'0');
    const s = String(sec % 60).padStart(2,'0');
    $('#ax-sum-runtime').textContent = `${h}:${m}:${s}`;
  }
  let logsDirty = false;
  const UI_LOG_TYPES = new Set(['system','scan','target','start','stop','attack','skill','hp','mana','stamina','resource','loot','success','warning','error']);
  function addLog(type, message) {
    const theme = UI_LOG_TYPES.has(type) ? type : 'system';
    appState.logs.push({
      time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}),
      type: theme,
      message: String(message || '')
    });
    if (appState.logs.length > 80) appState.logs.splice(0, appState.logs.length - 80);
    logsDirty = true;
    const logsView = $('.ax-view[data-view="logs"]');
    if (root.style.display !== 'none' && logsView?.classList.contains('active')) renderLogs();
  }
  function renderLogs() {
    const box = $('#ax-logs');
    const icons = {
      system:'⚙', scan:'⌁', target:'◎', start:'▶', stop:'■', attack:'⚔', skill:'✦',
      hp:'❤', mana:'💧', stamina:'⚡', resource:'•', loot:'◆', success:'✓', warning:'⚠', error:'✖'
    };
    box.innerHTML = appState.logs.map(x => `
      <div class="ax-log-line ax-log-row-${safe(x.type)}">
        <span class="ax-log-time">${safe(x.time)}</span>
        <span class="ax-log-type ax-log-${safe(x.type)}">${safe(icons[x.type] || '•')} ${safe(x.type.toUpperCase())}</span>
        <span class="ax-log-message">${safe(x.message)}</span>
      </div>
    `).join('');
    box.scrollTop = box.scrollHeight;
    logsDirty = false;
  }
  const structuralDirty = {
    targets: true,
    skills: true,
    potions: true,
    presets: true
  };
  // Drafts live independently of rendered input elements. A scanner refresh can
  // rebuild the Targets view, but it must never replace a value the user is
  // currently editing or waiting to debounce-save.
  const pendingTargetLimits = new Map();
  const targetLimitDraftKey = (key, phase) => `${key || ''}|${phase === 'phase3' ? 'phase3' : 'phase1'}`;
  function displayedTargetLimit(target, phase) {
    const key = targetLimitDraftKey(target?.key, phase);
    if (pendingTargetLimits.has(key)) return pendingTargetLimits.get(key);
    return phase === 'phase3'
      ? Number(target?.phase3DamageLimit || 0)
      : Number(target?.phase1DamageLimit ?? target?.damageLimit ?? 0);
  }
  function isViewActive(name) {
    return !!$(`.ax-view[data-view="${name}"]`)?.classList.contains('active');
  }
  function renderStructuralIfVisible() {
    if (structuralDirty.targets && isViewActive('targets')) {
      structuralDirty.targets = false;
      renderTargets();
    }
    if (isViewActive('combat') && structuralDirty.skills) {
      structuralDirty.skills = false;
      renderActiveSkills();
    }
    if (structuralDirty.potions && isViewActive('resources')) {
      structuralDirty.potions = false;
      renderPotions();
    }
    if (structuralDirty.presets && isViewActive('presets')) {
      structuralDirty.presets = false;
      renderPresets();
    }
  }
  function renderActiveSkills() {
    const box = $('#ax-active-skills');
    if (!box) return;
    const skills = Array.isArray(appState.activeSkills) ? appState.activeSkills : [];
    box.innerHTML = skills.length ? skills.map(skill => {
      const cost = [skill.manaCost > 0 ? `${fmt(skill.manaCost)} MP` : '', skill.staminaDisplayCost > 0 ? `${fmt(skill.staminaDisplayCost)} STAM` : ''].filter(Boolean).join(' / ');
      const kind = skill.behavior === 'buff' ? '✨ Buff → next attack' : '🔥 Direct damage';
      return `<label class="ax-skill-row">
        ${skill.icon ? `<img class="ax-skill-icon" src="${safe(skill.icon)}" alt="">` : `<div class="ax-skill-icon"></div>`}
        <span class="ax-skill-copy"><strong>${safe(skill.name)}</strong><span class="ax-skill-kind">${safe(kind)}</span><small>${safe(cost || 'Server managed')}</small></span>
        <input class="ax-skill-check" type="checkbox" data-skill-key="${safe(skill.key)}" ${skill.enabled ? 'checked' : ''}>
      </label>`;
    }).join('') : `<div class="ax-setting-copy"><small>No active skills discovered yet. AURELIX discovers them from a live battle page.</small></div>`;
  }
  function renderPotions() {
    const make = (p, idx, kind) => `
      <div class="ax-potion-row" data-potion-key="${safe(p.key || '')}">
        <div class="ax-potion-name">
          <strong>${safe(p.name || 'Unknown Potion')}</strong>
          <small>Available: ${fmt(p.count ?? p.max ?? 0)}</small>
        </div>
        <select class="ax-select ax-potion-select" data-kind="${kind}" data-index="${idx}" data-potion-key="${safe(p.key || '')}">
          <option value="off" ${p.enabled === true ? '' : 'selected'}>Disabled</option>
          <option value="on" ${p.enabled === true ? 'selected' : ''}>Use</option>
        </select>
        <input class="ax-num ax-potion-limit" data-kind="${kind}" data-index="${idx}" data-potion-key="${safe(p.key || '')}" type="number" min="0" value="${Number(p.limit || 0)}" title="0 = unlimited">
      </div>`;
    const stamina = appState.potions.stamina;
    const mana = appState.potions.mana;
    const hp = appState.potions.hp;
    $('#ax-stamina-potions').innerHTML = stamina.length
      ? stamina.map((p,i)=>make(p,i,'stamina')).join('')
      : `<div class="ax-setting-copy"><small>No stamina potions detected.</small></div>`;
    $('#ax-mana-potions').innerHTML = mana.length
      ? mana.map((p,i)=>make(p,i,'mana')).join('')
      : `<div class="ax-setting-copy"><small>No mana potions detected.</small></div>`;
    $('#ax-hp-potions').innerHTML = hp.length
      ? hp.map((p,i)=>make(p,i,'hp')).join('')
      : `<div class="ax-setting-copy"><small>No HP potions detected.</small></div>`;
  }
  function renderTargets() {
    const q = $('#ax-target-search').value.trim().toLowerCase();
    const filter = $('#ax-target-filter').value;
    const list = appState.targets.filter(t => {
      if (filter !== 'all' && t.source !== filter) return false;
      const hay = [
        t.name, t.gateName, t.waveName, t.dungeonName, t.locationName,
        t.gate, t.wave, t.dungeon, t.location
      ].filter(Boolean).join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    const grouped = new Map();
    for (const t of list) {
      const parent = t.source === 'gate'
        ? (t.gateName || t.gate || 'Unknown Gate')
        : (t.dungeonName || t.dungeon || 'Unknown Dungeon');
      const stage = t.source === 'gate'
        ? (t.waveName || t.wave || 'Unknown Wave')
        : (t.locationName || t.location || 'Unknown Location');
      const pKey = `${t.source}|${parent}`;
      if (!grouped.has(pKey)) grouped.set(pKey, { source: t.source, parent, stages: new Map() });
      const group = grouped.get(pKey);
      if (!group.stages.has(stage)) group.stages.set(stage, []);
      group.stages.get(stage).push(t);
    }
    const row = t => {
      const rawStatus = String(t.status || 'waiting').toLowerCase();
      const prettyName = displayTargetName(t.name || 'Unknown Target');
      const damageControls = t.phaseCapable
        ? `<div class="ax-phase-limits">
            <label class="ax-phase-limit-box"><span>P1 DMG</span><input class="ax-num ax-target-limit" data-phase="phase1" data-target-key="${safe(t.key || '')}" type="number" min="0" value="${displayedTargetLimit(t, 'phase1')}" placeholder="0"></label>
            <label class="ax-phase-limit-box"><span>P3 DMG</span><input class="ax-num ax-target-limit" data-phase="phase3" data-target-key="${safe(t.key || '')}" type="number" min="0" value="${displayedTargetLimit(t, 'phase3')}" placeholder="0"></label>
          </div>`
        : `<input class="ax-num ax-target-limit" data-phase="phase1" data-target-key="${safe(t.key || '')}" type="number" min="0" value="${displayedTargetLimit(t, 'phase1')}" placeholder="Damage limit">`;
      return `
        <div class="ax-target-row${t.enabled ? ' is-selected' : ''}" data-target-key="${safe(t.key || '')}">
          <input class="ax-target-check" type="checkbox" data-target-key="${safe(t.key || '')}" ${t.enabled ? 'checked' : ''} title="Enable target">
          <div>
            <strong>${safe(prettyName)}</strong>
            <small>${safe(rawStatus.toUpperCase())}</small>
          </div>
          <button class="ax-target-skill-btn${t.activeSkillEnabled ? ' on' : ''}" type="button" data-target-key="${safe(t.key || '')}" aria-pressed="${t.activeSkillEnabled ? 'true' : 'false'}">${t.activeSkillEnabled ? 'Active Skill: Use' : 'Active Skill: Disabled'}</button>
          ${damageControls}
        </div>`;
    };
    $('#ax-target-list').innerHTML = grouped.size
      ? [...grouped.values()].map(group => `
          <div class="ax-target-group">
            <div class="ax-target-parent">${safe(group.source === 'gate' ? '🚪 ' : '◆ ')}${safe(group.parent)}</div>
            ${[...group.stages.entries()].map(([stage, targets]) => `
              <div class="ax-target-stage">${safe(group.source === 'gate' ? '🌊 Wave • ' : '📍 Location • ')}${safe(stage)}</div>
              <div class="ax-target-stage-list">${targets.map(row).join('')}</div>
            `).join('')}
          </div>
        `).join('')
      : `<div class="ax-setting-copy"><small>No matching configured targets.</small></div>`;
  }
  function presetOptions(list, selected, missingLabel) {
    const known = new Set((list || []).map(x => String(x.id)));
    const missing = selected && !known.has(String(selected))
      ? `<option value="${safe(selected)}" selected disabled>${safe(missingLabel)} (missing)</option>` : '';
    return `<option value="" ${selected ? '' : 'selected'}>Keep Current</option>${missing}${(list || []).map(p => `<option value="${safe(p.id)}" ${String(p.id) === String(selected || '') ? 'selected' : ''}>${safe(p.name)}</option>`).join('')}`;
  }
  function renderPresets() {
    const data = appState.loadouts || {};
    const equipment = Array.isArray(data.equipmentPresets) ? data.equipmentPresets : [];
    const pets = Array.isArray(data.petPresets) ? data.petPresets : [];
    const active = data.active || {};
    const equipmentBox = $('#ax-equipment-presets');
    const petBox = $('#ax-pet-presets');
    if (!equipmentBox || !petBox) return;
    const card = (preset, kind, isActive, meta) => `
      <div class="ax-preset-card${isActive ? ' is-active' : ''}" data-preset-kind="${kind}" data-preset-id="${safe(preset.id)}">
        <div>
          <input class="ax-search ax-preset-rename" maxlength="40" value="${safe(preset.name)}" aria-label="Preset name" style="margin-bottom:4px;">
          <small>${safe(meta)}${isActive ? ' • ACTIVE' : ''}</small>
        </div>
        <div class="ax-preset-actions">
          ${kind === 'pet' ? `<button class="ax-mini-action" data-preset-action="edit" type="button" title="Edit formation">✎</button><button class="ax-mini-action" data-preset-action="duplicate" type="button" title="Duplicate preset">⧉</button>` : ''}
          <button class="ax-mini-action" data-preset-action="rename" type="button" title="Save name">✓</button>
          <button class="ax-mini-action" data-preset-action="update" type="button" title="Update from equipped">↻</button>
          <button class="ax-mini-action" data-preset-action="equip" type="button" title="Equip and verify">⚡</button>
          <button class="ax-mini-action danger" data-preset-action="delete" type="button" title="Delete preset">🗑️</button>
        </div>
      </div>`;
    equipmentBox.innerHTML = equipment.length ? equipment.map(p => {
      const gear = Object.keys(p.equipment || {}).length;
      const crystals = Object.values(p.equipment || {}).reduce((sum, item) => sum + (item?.crystals?.length || 0), 0);
      return card(p, 'equipment', String(active.equipmentPresetId || '') === String(p.id), `${gear} gear • ${crystals} crystals`);
    }).join('') : `<div class="ax-setting-copy"><small>No PvE equipment presets. Import existing presets or save the equipped setup.</small></div>`;
    petBox.innerHTML = pets.length ? pets.map(p => {
      let mains = 0, links = 0;
      for (let slot=1; slot<=3; slot++) {
        const cfg = p.slots?.[slot] || p.slots?.[String(slot)];
        if (cfg?.main?.id) mains++;
        for (let level=1; level<=2; level++) if (cfg?.links?.[level]?.id || cfg?.links?.[String(level)]?.id) links++;
      }
      return card(p, 'pet', String(active.petPresetId || '') === String(p.id), `${mains} main pets • ${links} links`);
    }).join('') : `<div class="ax-setting-copy"><small>No PvE pet presets. Import existing presets or save the equipped formation.</small></div>`;
    const status = $('#ax-loadout-status');
    if (status) {
      const eqName = equipment.find(p => String(p.id) === String(active.equipmentPresetId || ''))?.name || 'custom equipment';
      const petName = pets.find(p => String(p.id) === String(active.petPresetId || ''))?.name || 'custom pets';
      status.textContent = data.busy ? 'Changing and verifying loadout…' : active.detected ? `Equipped: ${eqName} + ${petName}` : 'Equipped loadout not detected yet';
    }
    const assignments = data.assignments || {};
    const assignmentQuery = String($('#ax-assignment-search')?.value || '').trim().toLowerCase();
    const assignmentFilter = $('#ax-assignment-filter')?.value || 'all';
    const assignmentTargets = appState.targets.filter(t => {
      if (assignmentFilter === 'enabled' && t.enabled !== true) return false;
      if ((assignmentFilter === 'gate' || assignmentFilter === 'dungeon') && t.source !== assignmentFilter) return false;
      const haystack = [t.name, t.gateName, t.waveName, t.dungeonName, t.locationName].filter(Boolean).join(' ').toLowerCase();
      return !assignmentQuery || haystack.includes(assignmentQuery);
    }).sort((a, b) => {
      const aPlace = [a.source, a.gateName, a.waveName, a.dungeonName, a.locationName, a.name].filter(Boolean).join('|');
      const bPlace = [b.source, b.gateName, b.waveName, b.dungeonName, b.locationName, b.name].filter(Boolean).join('|');
      return aPlace.localeCompare(bPlace, undefined, { numeric:true, sensitivity:'base' });
    });
    const assignmentBox = $('#ax-loadout-assignments');
    assignmentBox.innerHTML = assignmentTargets.length ? assignmentTargets.map(t => {
      const assignment = assignments[t.key] || { equipmentPresetId:t.equipmentPresetId || '', petPresetId:t.petPresetId || '' };
      const place = t.source === 'gate' ? `${t.gateName || 'Gate'} • ${t.waveName || 'Wave'}` : `${t.dungeonName || 'Dungeon'} • ${t.locationName || 'Location'}`;
      return `<div class="ax-assignment-row${t.enabled ? ' is-target-enabled' : ''}" data-target-key="${safe(t.key)}">
        <div><strong>${safe(displayTargetName(t.name))}</strong><small>${safe(place)} • ${t.enabled ? 'TARGET ENABLED' : 'TARGET DISABLED'}</small></div>
        <select class="ax-select ax-loadout-select" data-loadout-kind="equipment">${presetOptions(equipment, assignment.equipmentPresetId, 'Equipment preset')}</select>
        <select class="ax-select ax-loadout-select" data-loadout-kind="pet">${presetOptions(pets, assignment.petPresetId, 'Pet preset')}</select>
      </div>`;
    }).join('') : `<div class="ax-setting-copy"><small>No monsters have been discovered yet. Run the scanner once to build the assignment list.</small></div>`;
    renderPetBuilder();
  }
  function newPetBuilderDefinition(source = null) {
    const now = Date.now();
    const empty = () => ({ main:null, links:{ 1:null, 2:null } });
    if (!source) return { id:null, name:'', team:'attack', createdAt:now, slots:{ 1:empty(), 2:empty(), 3:empty() } };
    const copy = JSON.parse(JSON.stringify(source));
    copy.team = 'attack';
    for (let slot=1; slot<=3; slot++) {
      copy.slots[slot] = copy.slots?.[slot] || copy.slots?.[String(slot)] || empty();
      copy.slots[slot].links = copy.slots[slot].links || { 1:null, 2:null };
    }
    return copy;
  }
  function petBuilderChoice(pet, slot, level = 0) {
    const attrs = `data-builder-slot="${slot}" data-builder-level="${level}"`;
    if (!pet?.id) return `<button class="ax-pet-choice empty" type="button" ${attrs}>➕ Select ${level ? `Link ${level}` : 'Main Pet'}</button>`;
    return `<button class="ax-pet-choice" type="button" ${attrs} title="${safe(pet.name)}">
      ${pet.image ? `<img src="${safe(pet.image)}" alt="">` : '<span></span>'}
      <span><strong>${safe(pet.name)}</strong><small>ID ${safe(pet.id)}</small></span>
    </button>`;
  }
  function renderPetBuilder() {
    const card = $('#ax-pet-builder-card'), formation = $('#ax-pet-formation');
    if (!card || !formation) return;
    card.style.display = petBuilder ? 'block' : 'none';
    if (!petBuilder) return;
    $('#ax-pet-builder-name').value = petBuilder.name || '';
    $('#ax-pet-builder-mode').textContent = petBuilder.id ? 'EDITING' : 'NEW';
    formation.innerHTML = [1,2,3].map(slot => {
      const cfg = petBuilder.slots?.[slot] || { main:null, links:{ 1:null, 2:null } };
      return `<div class="ax-pet-slot">
        <div style="margin-bottom:12px; color:var(--ax-cyan); font-weight:700; font-size:11px;">SLOT 0${slot}</div>
        ${petBuilderChoice(cfg.main, slot, 0)}
        <div class="ax-pet-link-label">LINK 01</div>${petBuilderChoice(cfg.links?.[1], slot, 1)}
        <div class="ax-pet-link-label">LINK 02</div>${petBuilderChoice(cfg.links?.[2], slot, 2)}
      </div>`;
    }).join('');
  }
  function renderPetPicker(filter = '') {
    const box = $('#ax-pet-picker-grid');
    if (!box || !petPicker) return;
    const query = String(filter || '').trim().toLowerCase();
    const list = (petPicker.choices || []).filter(p => !query || String(p.name).toLowerCase().includes(query) || String(p.id).includes(query));
    box.innerHTML = `${petPicker.level ? '<button class="ax-pet-picker-item" data-picker-pet-id="" type="button" style="text-align:center; display:grid; place-items:center;"><strong>Remove Link</strong><small>Leave this link empty</small></button>' : ''}${list.map(p => `<button class="ax-pet-picker-item" data-picker-pet-id="${safe(p.id)}" type="button">
      ${p.image ? `<img src="${safe(p.image)}" alt="">` : ''}<strong>${safe(p.name)}</strong><small>ID ${safe(p.id)}</small>
    </button>`).join('')}`;
  }
  async function openPetBuilderPicker(slot, level) {
    if (!petBuilder) return;
    setLoadoutUiStatus('Loading pet choices…');
    try {
      let choices, title;
      if (level) {
        const main = petBuilder.slots?.[slot]?.main;
        if (!main?.id) throw new Error('Choose the main pet for this slot first.');
        choices = await window.AURELIX_ENGINE?.getPetLinkCandidates?.(main.id);
        title = `Select Link ${level} for ${main.name}`;
      } else {
        choices = await window.AURELIX_ENGINE?.getPetCatalogue?.();
        const used = new Set([1,2,3].filter(x => x !== slot).map(x => petBuilder.slots?.[x]?.main?.id).filter(Boolean).map(String));
        choices = (choices || []).filter(p => !used.has(String(p.id)));
        title = `Select Main Pet • Slot 0${slot}`;
      }
      petPicker = { slot, level, choices:choices || [] };
      $('#ax-pet-picker-title').textContent = title;
      $('#ax-pet-picker-search').value = '';
      renderPetPicker('');
      $('#ax-pet-picker').classList.add('open');
      setLoadoutUiStatus('Choose a pet.');
    } catch (error) { setLoadoutUiStatus(error?.message || error, true); }
  }
  const targetSaveTimers = new WeakMap();
  let assignmentSearchTimer = null;
  function refreshLoadoutUi() {
    try {
      const next = window.AURELIX_ENGINE?.getLoadoutState?.();
      if (next) appState.loadouts = next;
    } catch (error) { addLog('warning', `Preset state refresh failed: ${error?.message || error}`); }
    structuralDirty.presets = true;
    renderStructuralIfVisible();
  }
  function setLoadoutUiStatus(message, error = false) {
    const element = $('#ax-loadout-status');
    if (element) {
      element.textContent = String(message || '');
      element.style.color = error ? 'var(--ax-red)' : 'var(--ax-muted)';
    }
  }
  async function runPresetUiAction(label, action) {
    setLoadoutUiStatus(label);
    try {
      const result = await action();
      refreshLoadoutUi();
      setLoadoutUiStatus('Preset action completed and verified.');
      return result;
    } catch (error) {
      addLog('error', `Preset action failed: ${error?.message || error}`);
      setLoadoutUiStatus(error?.message || error, true);
      return null;
    }
  }
  const commitTargetLimit = input => {
    if (!input?.dataset?.targetKey) return;
    const prior = targetSaveTimers.get(input);
    if (prior) clearTimeout(prior);
    targetSaveTimers.delete(input);
    const damageLimit = Math.max(0, Math.floor(Number(input.value) || 0));
    input.value = String(damageLimit);
    const phase = input.dataset.phase === 'phase3' ? 'phase3' : 'phase1';
    const draftKey = targetLimitDraftKey(input.dataset.targetKey, phase);
    const patch = phase === 'phase3' ? { phase3DamageLimit: damageLimit } : { damageLimit, phase1DamageLimit: damageLimit };
    const saved = window.AURELIX_ENGINE?.setTargetPolicy?.(input.dataset.targetKey, patch);
    if (saved !== false) pendingTargetLimits.delete(draftKey);
    const item = appState.targets.find(t => t.key === input.dataset.targetKey);
    if (item) {
      if (phase === 'phase3') item.phase3DamageLimit = damageLimit;
      else { item.damageLimit = damageLimit; item.phase1DamageLimit = damageLimit; }
    }
  };
  shadow.addEventListener('click', async event => {
    const clicked = event.target instanceof Element ? event.target : null;
    if (!clicked) return;
    const subview = clicked.closest('[data-preset-subview]');
    if (subview) {
      const name = subview.dataset.presetSubview;
      $$('[data-preset-subview]').forEach(button => button.classList.toggle('active', button === subview));
      $$('[data-preset-panel]').forEach(panel => panel.style.display = panel.dataset.presetPanel === name ? 'block' : 'none');
      return;
    }

    if (clicked.closest('#ax-auto-loot')) {
      const btn = clicked.closest('#ax-auto-loot');
      const isOn = btn.classList.toggle('on');
      window.AURELIX_ENGINE?.setSettings?.({ autoLoot: isOn });
      return;
    }

    if (clicked.closest('#ax-effects-toggle')) {
      const btn = clicked.closest('#ax-effects-toggle');
      const isOn = btn.classList.toggle('on');
      root.classList.toggle('ax-effects-off', !isOn);
      uiStoreSet(STORE.effects, isOn ? '1' : '0');
      return;
    }

    if (clicked.closest('.ax-theme')) {
      const btn = clicked.closest('.ax-theme');
      root.dataset.theme = btn.dataset.theme;
      $$('.ax-theme').forEach(x => x.classList.toggle('active', x === btn));
      uiStoreSet(STORE.theme, btn.dataset.theme);
      return;
    }

    const modeBtn = clicked.closest('#ax-mode-grid .ax-choice-btn');
    if (modeBtn) {
      appState.mode = modeBtn.dataset.mode;
      $$('#ax-mode-grid .ax-choice-btn').forEach(x => x.classList.toggle('active', x === modeBtn));
      window.AURELIX_ENGINE?.setSettings?.({ mode: modeBtn.dataset.mode });
      return;
    }

    if (clicked.closest('#ax-new-pet-preset')) {
      petBuilder = newPetBuilderDefinition();
      petBuilderSnapshot = null;
      renderPetBuilder();
      $('#ax-pet-builder-card')?.scrollIntoView?.({ block:'nearest' });
      setLoadoutUiStatus('Building a new PvE pet preset.');
      return;
    }
    if (clicked.closest('#ax-pet-builder-cancel')) {
      petBuilder = null; petBuilderSnapshot = null; petPicker = null;
      $('#ax-pet-picker')?.classList.remove('open');
      renderPetBuilder(); setLoadoutUiStatus('Pet formation edit canceled.'); return;
    }
    if (clicked.closest('#ax-pet-builder-save')) {
      if (!petBuilder) return;
      petBuilder.name = $('#ax-pet-builder-name')?.value.trim() || '';
      if (!petBuilder.name) { setLoadoutUiStatus('Enter a pet preset name first.', true); return; }
      const saved = await runPresetUiAction('Validating and saving pet formation…', async () => window.AURELIX_ENGINE?.savePetPresetDefinition?.(petBuilder));
      if (saved) { petBuilder = null; petBuilderSnapshot = null; renderPetBuilder(); }
      return;
    }
    const builderChoice = clicked.closest('[data-builder-slot]');
    if (builderChoice) {
      if (petBuilder) petBuilder.name = $('#ax-pet-builder-name')?.value || petBuilder.name;
      await openPetBuilderPicker(Number(builderChoice.dataset.builderSlot), Number(builderChoice.dataset.builderLevel) || 0);
      return;
    }
    if (clicked.closest('#ax-pet-picker-close')) {
      $('#ax-pet-picker')?.classList.remove('open'); petPicker = null; return;
    }
    const pickerChoice = clicked.closest('[data-picker-pet-id]');
    if (pickerChoice && petPicker && petBuilder) {
      const id = pickerChoice.dataset.pickerPetId;
      const chosen = id ? petPicker.choices.find(p => String(p.id) === String(id)) : null;
      const cfg = petBuilder.slots[petPicker.slot];
      if (petPicker.level) cfg.links[petPicker.level] = chosen ? { ...chosen } : null;
      else {
        cfg.main = chosen ? { ...chosen } : null;
        cfg.links[1] = null; cfg.links[2] = null;
      }
      $('#ax-pet-picker')?.classList.remove('open'); petPicker = null;
      renderPetBuilder(); return;
    }
    if (clicked.closest('#ax-sync-presets')) {
      window.AURELIX_ENGINE?.syncLegacyPresets?.({ log:true, force:true });
      refreshLoadoutUi();
      setLoadoutUiStatus('Existing PvE presets imported.');
      return;
    }
    if (clicked.closest('#ax-detect-loadout')) {
      await runPresetUiAction('Detecting equipped equipment, crystals, and pets…', () => window.AURELIX_ENGINE?.detectActiveLoadout?.());
      return;
    }
    if (clicked.closest('#ax-save-equipment-preset')) {
      const input = $('#ax-equipment-preset-name');
      const name = input?.value.trim();
      if (!name) { setLoadoutUiStatus('Enter an equipment preset name first.', true); return; }
      const result = await runPresetUiAction('Reading equipped PvE equipment and crystals…', () => window.AURELIX_ENGINE?.captureEquipmentPreset?.(name));
      if (result && input) input.value = '';
      return;
    }
    if (clicked.closest('#ax-save-pet-preset')) {
      const input = $('#ax-pet-preset-name');
      const name = input?.value.trim();
      if (!name) { setLoadoutUiStatus('Enter a pet preset name first.', true); return; }
      const result = await runPresetUiAction('Reading equipped PvE pets and links…', () => window.AURELIX_ENGINE?.capturePetPreset?.(name));
      if (result && input) input.value = '';
      return;
    }
    const actionButton = clicked.closest('[data-preset-action]');
    if (actionButton) {
      const card = actionButton.closest('[data-preset-kind][data-preset-id]');
      const kind = card?.dataset.presetKind, id = card?.dataset.presetId;
      if (!kind || !id) return;
      if (actionButton.dataset.presetAction === 'edit' && kind === 'pet') {
        const source = appState.loadouts.petPresets.find(p => String(p.id) === String(id));
        if (!source) { setLoadoutUiStatus('Pet preset no longer exists.', true); return; }
        petBuilderSnapshot = JSON.parse(JSON.stringify(source));
        petBuilder = newPetBuilderDefinition(source);
        renderPetBuilder();
        $('#ax-pet-builder-card')?.scrollIntoView?.({ block:'nearest' });
        setLoadoutUiStatus(`Editing “${source.name}”.`); return;
      }
      if (actionButton.dataset.presetAction === 'duplicate' && kind === 'pet') {
        await runPresetUiAction('Duplicating pet formation…', async () => window.AURELIX_ENGINE?.duplicatePetPreset?.(id));
        return;
      }
      if (actionButton.dataset.presetAction === 'rename') {
        const name = card.querySelector('.ax-preset-rename')?.value.trim();
        if (!name || !window.AURELIX_ENGINE?.renameLoadoutPreset?.(kind, id, name)) setLoadoutUiStatus('Preset name could not be saved.', true);
        else { refreshLoadoutUi(); setLoadoutUiStatus('Preset renamed.'); }
        return;
      }
      if (actionButton.dataset.presetAction === 'delete') {
        const name = card.querySelector('.ax-preset-rename')?.value || 'this preset';
        if (!confirm(`Delete “${name}”? Monster assignments using it will be marked missing.`)) return;
        window.AURELIX_ENGINE?.deleteLoadoutPreset?.(kind, id);
        refreshLoadoutUi(); setLoadoutUiStatus('Preset deleted.'); return;
      }
      if (actionButton.dataset.presetAction === 'update') {
        await runPresetUiAction('Updating preset from the equipped PvE setup…', () => window.AURELIX_ENGINE?.updateLoadoutPreset?.(kind, id));
        return;
      }
      if (actionButton.dataset.presetAction === 'equip') {
        const assignment = kind === 'equipment' ? { equipmentPresetId:id } : { petPresetId:id };
        await runPresetUiAction('Applying and verifying preset…', () => window.AURELIX_ENGINE?.applyLoadoutAssignment?.(assignment, { manual:true }));
        return;
      }
    }
    const button = clicked.closest('.ax-target-skill-btn');
    if (!button?.dataset?.targetKey) return;
    const item = appState.targets.find(t => t.key === button.dataset.targetKey);
    const next = !(item?.activeSkillEnabled === true);
    const ok = window.AURELIX_ENGINE?.setActiveSkillTargetPolicy?.(button.dataset.targetKey, { enabled: next });
    if (ok === false) {
      addLog('error', `Active Skill preference could not be saved for ${item?.name || 'target'}.`);
      return;
    }
    if (item) item.activeSkillEnabled = next;
    button.classList.toggle('on', next);
    button.setAttribute('aria-pressed', next ? 'true' : 'false');
    button.textContent = next ? 'Active Skill: Use' : 'Active Skill: Disabled';
  });
  shadow.addEventListener('change', event => {
    const el = event.target;
    if (!(el instanceof Element)) return;
    if (el.matches('#ax-assignment-filter')) { renderPresets(); return; }
    if (el.matches('.ax-target-check')) {
      window.AURELIX_ENGINE?.setTargetPolicy?.(el.dataset.targetKey, { enabled: el.checked });
      const item = appState.targets.find(t => t.key === el.dataset.targetKey);
      if (item) item.enabled = el.checked;
      el.closest('.ax-target-row')?.classList.toggle('is-selected', el.checked);
      structuralDirty.presets = true;
      return;
    }
    if (el.matches('.ax-loadout-select')) {
      const row = el.closest('[data-target-key]');
      if (!row?.dataset.targetKey) return;
      const patch = el.dataset.loadoutKind === 'pet' ? { petPresetId:el.value } : { equipmentPresetId:el.value };
      window.AURELIX_ENGINE?.setTargetLoadoutAssignment?.(row.dataset.targetKey, patch);
      const item = appState.targets.find(t => t.key === row.dataset.targetKey);
      if (item) Object.assign(item, patch);
      refreshLoadoutUi();
      return;
    }
    if (el.matches('.ax-target-limit')) { commitTargetLimit(el); return; }
    if (el.matches('.ax-skill-check')) {
      window.AURELIX_ENGINE?.setActiveSkillPolicy?.(el.dataset.skillKey, { enabled: el.checked });
      const item = appState.activeSkills.find(x => x.key === el.dataset.skillKey);
      if (item) item.enabled = el.checked;
      return;
    }
    if (el.matches('.ax-potion-select')) {
      const enabled = el.value === 'on';
      if (enabled) {
        $$('.ax-potion-select').forEach(other => {
          if (other === el || other.dataset.kind !== el.dataset.kind) return;
          other.value = 'off';
          window.AURELIX_ENGINE?.setPotionPolicy?.(other.dataset.potionKey, { enabled: false });
        });
      }
      window.AURELIX_ENGINE?.setPotionPolicy?.(el.dataset.potionKey, { enabled });
      return;
    }
    if (el.matches('.ax-potion-limit')) {
      const limit = Math.max(0, Math.floor(Number(el.value) || 0));
      el.value = String(limit);
      window.AURELIX_ENGINE?.setPotionPolicy?.(el.dataset.potionKey, { limit });
    }
  });
  shadow.addEventListener('input', event => {
    const el = event.target;
    if (el instanceof Element && el.matches('#ax-assignment-search')) {
      if (assignmentSearchTimer) clearTimeout(assignmentSearchTimer);
      assignmentSearchTimer = setTimeout(() => { assignmentSearchTimer = null; renderPresets(); }, 100);
      return;
    }
    if (el instanceof Element && el.matches('#ax-pet-builder-name')) { if (petBuilder) petBuilder.name = el.value; return; }
    if (el instanceof Element && el.matches('#ax-pet-picker-search')) { renderPetPicker(el.value); return; }
    if (!(el instanceof Element) || !el.matches('.ax-target-limit')) return;
    const phase = el.dataset.phase === 'phase3' ? 'phase3' : 'phase1';
    pendingTargetLimits.set(targetLimitDraftKey(el.dataset.targetKey, phase), Math.max(0, Math.floor(Number(el.value) || 0)));
    const prior = targetSaveTimers.get(el);
    if (prior) clearTimeout(prior);
    targetSaveTimers.set(el, setTimeout(() => commitTargetLimit(el), 180));
  });
  shadow.addEventListener('focusout', event => {
    const el = event.target;
    if (el instanceof Element && el.matches('.ax-target-limit')) commitTargetLimit(el);
  });
  shadow.addEventListener('keydown', event => {
    const el = event.target;
    if (event.key === 'Enter' && el instanceof Element && el.matches('.ax-target-limit')) commitTargetLimit(el);
  });
  const flushVisibleTargetLimits = () => {
    const changed = [];
    $$('.ax-target-limit').forEach(input => {
      if (!input?.dataset?.targetKey) return;
      const damageLimit = Math.max(0, Math.floor(Number(input.value) || 0));
      const item = appState.targets.find(t => t.key === input.dataset.targetKey);
      if (!item) return;
      const phase = input.dataset.phase === 'phase3' ? 'phase3' : 'phase1';
      if (phase === 'phase3') {
        if (Number(item.phase3DamageLimit || 0) === damageLimit) return;
        item.phase3DamageLimit = damageLimit;
        changed.push({ key: input.dataset.targetKey, phase3DamageLimit: damageLimit });
      } else {
        if (Number(item.phase1DamageLimit ?? item.damageLimit ?? 0) === damageLimit) return;
        item.damageLimit = damageLimit;
        item.phase1DamageLimit = damageLimit;
        changed.push({ key: input.dataset.targetKey, damageLimit, phase1DamageLimit: damageLimit });
      }
    });
    if (!changed.length) return;
    if (window.AURELIX_ENGINE?.bulkSetTargetPolicies) window.AURELIX_ENGINE.bulkSetTargetPolicies(changed);
    else changed.forEach(item => window.AURELIX_ENGINE?.setTargetPolicy?.(item.key, { damageLimit: item.damageLimit }));
  };
  window.addEventListener('pagehide', flushVisibleTargetLimits, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushVisibleTargetLimits();
  });
  function loadPreferences() {
    const width = clamp(uiStoreGet(STORE.width) ?? DEFAULTS.width, 760, 1320);
    const height = clamp(uiStoreGet(STORE.height) ?? DEFAULTS.height, 540, 920);
    const scale = clamp(uiStoreGet(STORE.scale) ?? DEFAULTS.scale, .9, 1.35);
    const theme = uiStoreGet(STORE.theme) || DEFAULTS.theme;
    if (uiStoreGet(STORE.effectsRepair) !== '1') {
      uiStoreSet(STORE.effects, '1');
      uiStoreSet(STORE.effectsRepair, '1');
    }
    const effectsStr = uiStoreGet(STORE.effects);
    const effects = effectsStr === null ? DEFAULTS.effects : effectsStr !== '0';

    root.style.setProperty('--ax-w', `${width}px`);
    root.style.setProperty('--ax-h', `${height}px`);
    root.style.setProperty('--ax-scale', String(scale));
    root.dataset.theme = ['crimsonCore','aegis','abyss','royal','forge','emerald','nova','cyberpunk','frostbite','voidglitch','aurora','solarFlare','obsidianGold','sakuraNight','pitchBlack','toxicMatrix','inferno','spectralGlass','neonNoir','deepOcean','bloodMoon','ultraviolet'].includes(theme) ? theme : DEFAULTS.theme;
    root.classList.toggle('ax-effects-off', !effects);

    $('#ax-size-width').value = width;
    $('#ax-size-height').value = height;
    $('#ax-size-scale').value = Math.round(scale * 100);
    $('#ax-size-width-out').textContent = `${width}px`;
    $('#ax-size-height-out').textContent = `${height}px`;
    $('#ax-size-scale-out').textContent = `${Math.round(scale * 100)}%`;
    $('#ax-effects-toggle').classList.toggle('on', effects);
    $$('.ax-theme').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === root.dataset.theme));
  }
  function bindPreferences() {
    $('#ax-size-width').addEventListener('input', e => {
      const v = clamp(e.target.value,760,1320);
      root.style.setProperty('--ax-w', `${v}px`);
      $('#ax-size-width-out').textContent = `${v}px`;
      uiStoreSet(STORE.width, String(v));
    });
    $('#ax-size-height').addEventListener('input', e => {
      const v = clamp(e.target.value,540,920);
      root.style.setProperty('--ax-h', `${v}px`);
      $('#ax-size-height-out').textContent = `${v}px`;
      uiStoreSet(STORE.height, String(v));
    });
    $('#ax-size-scale').addEventListener('input', e => {
      const v = clamp(Number(e.target.value)/100,.9,1.35);
      root.style.setProperty('--ax-scale', String(v));
      $('#ax-size-scale-out').textContent = `${Math.round(v*100)}%`;
      uiStoreSet(STORE.scale, String(v));
    });
  }
  async function refreshSkillsIntoUi(force = true) {
    const engine = window.AURELIX_ENGINE;
    if (!engine?.refreshActiveSkills) return;
    try {
      const skills = await engine.refreshActiveSkills(force);
      if (Array.isArray(skills)) {
        appState.activeSkills = skills;
        structuralDirty.skills = true;
        renderStructuralIfVisible();
      }
    } catch (error) {
      addLog('warning', `Active skill refresh failed: ${error?.message || error}`);
    }
  }
  function switchView(name) {
    $$('.ax-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    $$('.ax-view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    uiStoreSet(STORE.tab, name);
    if (name === 'logs' && logsDirty) renderLogs();
    renderStructuralIfVisible();
    if (name === 'combat') void refreshSkillsIntoUi(true);
    if (name === 'presets') refreshLoadoutUi();
    if (name === 'overview') renderOverview();
    if (name === 'updates') renderAurelixUpdateCenter();
  }
  $$('.ax-nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  const savedTab = uiStoreGet(STORE.tab);
  if (savedTab && $(`.ax-nav-btn[data-view="${savedTab}"]`)) switchView(savedTab);

/* =========================================================
   AURELIX UPDATE CENTER CONTROLLER
   ========================================================= */

function renderAurelixUpdateCenter(state = AURELIX_UPDATE_STATE) {
  const badge = $('#ax-update-badge');
  const current = $('#ax-update-current');
  const latest = $('#ax-update-latest');
  const status = $('#ax-update-status');
  const checkButton = $('#ax-update-check');
  const installButton = $('#ax-update-install');
  const releaseInfo = $('#ax-update-release-info');
  const changelog = $('#ax-update-changelog');
  const channel = $('#ax-update-channel');
  const checked = $('#ax-update-checked');

  // Update Center may not exist in older/cached UI markup.
  if (
    !badge ||
    !current ||
    !latest ||
    !status ||
    !checkButton ||
    !installButton
  ) {
    return;
  }

  current.textContent =
    state.currentVersion || AURELIX_UPDATE.currentVersion;

  latest.textContent =
    state.latestVersion || '—';

  checked.textContent =
    state.checkedAt
      ? new Date(state.checkedAt).toLocaleString()
      : 'Never';

  const release = state.release || {};

  channel.textContent =
    release.channel
      ? String(release.channel).toUpperCase()
      : 'STABLE';


  /* -------------------------
     CHANGELOG
     ------------------------- */

  if (Array.isArray(release.changelog) && release.changelog.length) {
    changelog.innerHTML = '';

    for (const entry of release.changelog) {
      const item = document.createElement('div');

      item.className = 'ax-update-change';
      item.textContent = String(entry);

      changelog.appendChild(item);
    }
  } else {
    changelog.innerHTML = `
      <div class="ax-update-empty">
        No release information loaded.
      </div>
    `;
  }


  /* -------------------------
     RELEASE INFORMATION
     ------------------------- */

  if (release.version) {
    const parts = [];

    if (release.released) {
      parts.push(`Released ${release.released}`);
    }

    if (release.channel) {
      parts.push(`${String(release.channel).toUpperCase()} channel`);
    }

    releaseInfo.textContent =
      parts.length
        ? parts.join(' • ')
        : `AURELIX ${release.version}`;
  } else {
    releaseInfo.textContent =
      'Release information will appear after checking for updates.';
  }


  /* -------------------------
     STATUS
     ------------------------- */

  switch (state.status) {

    case 'checking':
      badge.textContent = 'CHECKING';

      status.innerHTML = `
        <div class="ax-update-status-icon">◌</div>

        <div>
          <div class="ax-update-status-title">
            Checking for updates...
          </div>

          <div class="ax-update-status-sub">
            Contacting the AURELIX release server.
          </div>
        </div>
      `;

      checkButton.disabled = true;
      checkButton.textContent = '⏳ Checking...';

      installButton.disabled = true;
      break;


    case 'current':
      badge.textContent = 'UP TO DATE';

      status.innerHTML = `
        <div class="ax-update-status-icon">✓</div>

        <div>
          <div class="ax-update-status-title">
            AURELIX is up to date
          </div>

          <div class="ax-update-status-sub">
            You are running the latest stable release.
          </div>
        </div>
      `;

      checkButton.disabled = false;
      checkButton.textContent = '🔍 Check Again';

      installButton.disabled = true;
      break;


    case 'available':
      badge.textContent = 'UPDATE AVAILABLE';

      status.innerHTML = `
        <div class="ax-update-status-icon">↑</div>

        <div>
          <div class="ax-update-status-title">
            A new AURELIX version is available
          </div>

          <div class="ax-update-status-sub">
            Version ${state.latestVersion} is ready to install.
          </div>
        </div>
      `;

      checkButton.disabled = false;
      checkButton.textContent = '🔍 Check Again';

      installButton.disabled = false;
      break;


    case 'error':
      badge.textContent = 'CHECK FAILED';

      status.innerHTML = `
        <div class="ax-update-status-icon">!</div>

        <div>
          <div class="ax-update-status-title">
            Unable to check for updates
          </div>

          <div class="ax-update-status-sub"></div>
        </div>
      `;

      const errorText =
        status.querySelector('.ax-update-status-sub');

      if (errorText) {
        errorText.textContent =
          state.error || 'Unknown update error.';
      }

      checkButton.disabled = false;
      checkButton.textContent = '↻ Retry';

      installButton.disabled = true;
      break;


    default:
      badge.textContent = 'NOT CHECKED';

      status.innerHTML = `
        <div class="ax-update-status-icon">◌</div>

        <div>
          <div class="ax-update-status-title">
            Update status not checked
          </div>

          <div class="ax-update-status-sub">
            Check GitHub for the latest stable AURELIX release.
          </div>
        </div>
      `;

      checkButton.disabled = false;
      checkButton.textContent = '🔍 Check Update';

      installButton.disabled = true;
      break;
  }
}


/* -------------------------
   CHECK UPDATE
   ------------------------- */

$('#ax-update-check')?.addEventListener('click', async () => {

  AURELIX_UPDATE_STATE.status = 'checking';
  AURELIX_UPDATE_STATE.error = null;

  renderAurelixUpdateCenter();

  try {

    await aurelixGetUpdateStatus(true);

    renderAurelixUpdateCenter();

  } catch (error) {

    renderAurelixUpdateCenter();

    addLog(
      'error',
      `Update check failed: ${error?.message || error}`
    );
  }
});
/* -------------------------
   INSTALL UPDATE
   ------------------------- */

$('#ax-update-install')?.addEventListener('click', () => {
  const state = AURELIX_UPDATE_STATE;

  // Never install unless a newer version was actually verified.
  if (
    state.status !== 'available' ||
    !state.latestVersion ||
    aurelixCompareVersions(
      state.latestVersion,
      AURELIX_UPDATE.currentVersion
    ) <= 0
  ) {
    renderAurelixUpdateCenter();
    return;
  }

  const releaseDownloadURL =
    state.release?.download_url ||
    AURELIX_UPDATE.downloadURL;

  try {
    const url = new URL(releaseDownloadURL);

    // Only allow the trusted AURELIX GitHub release location.
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'raw.githubusercontent.com' ||
      !url.pathname.startsWith('/cosmic451/AURELIX/')
    ) {
      throw new Error('Untrusted AURELIX update URL.');
    }

    addLog(
      'info',
      `Opening AURELIX ${state.latestVersion} installer...`
    );

    window.open(
      url.href,
      '_blank',
      'noopener,noreferrer'
    );

  } catch (error) {
    addLog(
      'error',
      `Unable to open AURELIX update: ${error?.message || error}`
    );
  }
});

/* Initial Update Center state */
renderAurelixUpdateCenter();

  const syncThreshold = value => {
    const v = clamp(value,1,99);
    $('#ax-exp-threshold').value = v;
    $('#ax-exp-threshold-num').value = v;
    window.AURELIX_ENGINE?.setSettings?.({ expThreshold: v });
  };
  $('#ax-exp-threshold').addEventListener('input', e => syncThreshold(e.target.value));
  $('#ax-exp-threshold-num').addEventListener('input', e => syncThreshold(e.target.value));
  let targetSearchTimer = null;
  $('#ax-target-search').addEventListener('input', () => {
    if (targetSearchTimer) clearTimeout(targetSearchTimer);
    targetSearchTimer = setTimeout(() => { targetSearchTimer = null; renderTargets(); }, 90);
  });
  $('#ax-target-filter').addEventListener('change', renderTargets);
  $('#ax-engine-toggle').addEventListener('click', async () => {
    const engine = window.AURELIX_ENGINE;
    if (!engine) {
      addLog('error', 'AURELIX Engine is unavailable.');
      return;
    }
    try {
      const runtime = engine.getRuntimeState();
      if (runtime.running || runtime.state === 'STARTING') await engine.stop();
      else await engine.start();
      syncExternalRuntime();
    } catch (error) {
      addLog('error', `Engine control failed: ${error?.message || error}`);
    }
  });
  function minimize() {
    if (root.style.display === 'none') return;
    root.style.transition = 'opacity .14s ease';
    root.style.opacity = '0';
    setTimeout(() => {
      root.style.display = 'none';
      root.style.opacity = '';
      root.style.transition = '';
      mini.classList.add('show');
      requestAnimationFrame(applySavedMiniPosition);
      uiStoreSet(STORE.minimized,'1');
    }, 145);
  }
  function restore() {
    mini.classList.remove('show');
    root.style.display = '';
    root.style.opacity = '0';
    root.style.transition = 'opacity .16s ease';
    requestAnimationFrame(() => {
      root.style.opacity = '1';
      setTimeout(() => {
        root.style.opacity = '';
        root.style.transition = '';
      }, 170);
    });
    uiStoreSet(STORE.minimized,'0');
    if (isViewActive('combat')) void refreshSkillsIntoUi(true);
  }
  function commitAllVisibleConfiguration() {
    flushVisibleTargetLimits();
    const visibleTargets = $$('.ax-target-check').map(box => {
      const item = appState.targets.find(t => t.key === box.dataset.targetKey);
      if (item) item.enabled = box.checked;
      return box.dataset.targetKey ? {
        key: box.dataset.targetKey,
        enabled: box.checked,
        damageLimit: Number(item?.phase1DamageLimit ?? item?.damageLimit ?? 0),
        phase1DamageLimit: Number(item?.phase1DamageLimit ?? item?.damageLimit ?? 0),
        phase3DamageLimit: Number(item?.phase3DamageLimit || 0)
      } : null;
    }).filter(Boolean);
    if (visibleTargets.length) {
      if (window.AURELIX_ENGINE?.bulkSetTargetPolicies) window.AURELIX_ENGINE.bulkSetTargetPolicies(visibleTargets);
      else visibleTargets.forEach(item => window.AURELIX_ENGINE?.setTargetPolicy?.(item.key, item));
    }
    $$('.ax-potion-select').forEach(select => { if (select.dataset.potionKey) window.AURELIX_ENGINE?.setPotionPolicy?.(select.dataset.potionKey, { enabled: select.value === 'on' }); });
    $$('.ax-potion-limit').forEach(input => {
      if (!input.dataset.potionKey) return;
      const limit = Math.max(0, Math.floor(Number(input.value) || 0));
      input.value = String(limit);
      window.AURELIX_ENGINE?.setPotionPolicy?.(input.dataset.potionKey, { limit });
    });
    $$('.ax-skill-check').forEach(box => { if (box.dataset.skillKey) window.AURELIX_ENGINE?.setActiveSkillPolicy?.(box.dataset.skillKey, { enabled: box.checked }); });
    const mode = $('.ax-choice-btn.active')?.dataset?.mode;
    const expThreshold = Math.max(1, Math.min(99, Math.round(Number($('#ax-exp-threshold-num')?.value) || 20)));
    window.AURELIX_ENGINE?.setSettings?.({ ...(mode ? { mode } : {}), autoLoot: $('#ax-auto-loot')?.classList.contains('on') !== false, expThreshold });
    const width = clamp(Number($('#ax-size-width')?.value) || DEFAULTS.width, 760, 1320);
    const height = clamp(Number($('#ax-size-height')?.value) || DEFAULTS.height, 540, 920);
    const scalePct = clamp(Number($('#ax-size-scale')?.value) || 100, 90, 135);
    uiStoreSet(STORE.width, String(width));
    uiStoreSet(STORE.height, String(height));
    uiStoreSet(STORE.scale, String(scalePct / 100));
    uiStoreSet(STORE.theme, root.dataset.theme || DEFAULTS.theme);
    uiStoreSet(STORE.effects, root.classList.contains('ax-effects-off') ? '0' : '1');
    uiStoreSet(STORE.tab, $('.ax-nav-btn.active')?.dataset?.view || 'overview');
  }
  $('#ax-save-settings').addEventListener('click', () => {
    const button = $('#ax-save-settings');
    const original = button.textContent;
    try {
      commitAllVisibleConfiguration();
      const result = window.AURELIX_ENGINE?.saveAllConfiguration?.();
      const ok = result?.ok === true;
      button.classList.toggle('saved', ok);
      button.classList.toggle('failed', !ok);
      button.textContent = ok ? '✓ Saved' : '⚠ Failed';
      addLog(ok ? 'success' : 'error', ok ? 'All settings saved.' : 'Settings save verification failed.');
    } catch (error) {
      button.classList.remove('saved');
      button.classList.add('failed');
      button.textContent = '⚠ Failed';
      addLog('error', `Settings save failed: ${error?.message || error}`);
    }
    setTimeout(() => { button.classList.remove('saved', 'failed'); button.textContent = original; }, 1800);
  });
  $('#ax-minimize').addEventListener('click', minimize);
  let miniDrag = null;
  let miniMoved = false;
  function applySavedMiniPosition() {
    const x = Number(uiStoreGet(STORE.miniX));
    const y = Number(uiStoreGet(STORE.miniY));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const size = mini.offsetWidth || 56;
    mini.style.left = `${clamp(x,0,Math.max(0,innerWidth-size))}px`;
    mini.style.top = `${clamp(y,0,Math.max(0,innerHeight-size))}px`;
    mini.style.right = 'auto';
    mini.style.bottom = 'auto';
    mini.style.transform = 'none';
  }
  mini.addEventListener('pointerdown', e => {
    miniMoved = false;
    const r = mini.getBoundingClientRect();
    mini.style.left = `${r.left}px`;
    mini.style.top = `${r.top}px`;
    mini.style.right = 'auto';
    mini.style.bottom = 'auto';
    mini.style.transform = 'none';
    miniDrag = {
      id:e.pointerId,
      dx:e.clientX-r.left,
      dy:e.clientY-r.top,
      startX:e.clientX,
      startY:e.clientY
    };
    mini.setPointerCapture?.(e.pointerId);
  });
  mini.addEventListener('pointermove', e => {
    if (!miniDrag || miniDrag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX-miniDrag.startX,e.clientY-miniDrag.startY) > 4) miniMoved = true;
    mini.style.left = `${clamp(e.clientX-miniDrag.dx,0,Math.max(0,innerWidth-mini.offsetWidth))}px`;
    mini.style.top = `${clamp(e.clientY-miniDrag.dy,0,Math.max(0,innerHeight-mini.offsetHeight))}px`;
  });
  mini.addEventListener('pointerup', e => {
    if (!miniDrag || miniDrag.id !== e.pointerId) return;
    const r = mini.getBoundingClientRect();
    uiStoreSet(STORE.miniX, String(Math.round(r.left)));
    uiStoreSet(STORE.miniY, String(Math.round(r.top)));
    miniDrag = null;
    if (!miniMoved) restore();
  });
  mini.addEventListener('pointercancel', () => { miniDrag = null; });
  root.style.display = 'none';
  mini.classList.add('show');
  uiStoreSet(STORE.minimized, '1');
  requestAnimationFrame(applySavedMiniPosition);
  let drag = null;
  const dragHandle = $('#ax-drag');
  dragHandle.addEventListener('pointerdown', e => {
    if (matchMedia('(max-width:860px)').matches) return;
    if (e.target.closest('button')) return;
    const r = root.getBoundingClientRect();
    root.style.transform = 'none';
    root.style.left = `${r.left}px`;
    root.style.top = `${r.top}px`;
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    dragHandle.setPointerCapture?.(e.pointerId);
  });
  dragHandle.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const maxLeft = Math.max(0, innerWidth - root.offsetWidth);
    const maxTop = Math.max(0, innerHeight - root.offsetHeight);
    root.style.left = `${clamp(e.clientX - drag.dx, 0, maxLeft)}px`;
    root.style.top = `${clamp(e.clientY - drag.dy, 0, maxTop)}px`;
  });
  const endPanelDrag = e => {
    if (!drag || (e?.pointerId != null && drag.id !== e.pointerId)) return;
    drag = null;
  };
  dragHandle.addEventListener('pointerup', endPanelDrag);
  dragHandle.addEventListener('pointercancel', endPanelDrag);
  window.addEventListener('resize', () => {
    if (mini.classList.contains('show')) applySavedMiniPosition();
  });
  function renderScannerState() {
    const el = $('#ax-footer-right');
    const panelScan = $('#ax-panel-scan');
    let status = null;
    try { status = window.AURELIX?.status?.(); } catch (error) { console.error('[AURELIX UI] scanner status failed', error); }
    const scanning = scannerBusy || !!status?.scanning;
    if (panelScan) panelScan.classList.toggle('show', scanning);
    if (!el) return;
    if (scanning) {
      el.innerHTML = `<span class="ax-scan-indicator"><span class="ax-scan-spinner"></span>Scanning world…</span>`;
      return;
    }
    const report = discoverScannerReport();
    el.textContent = report ? `Scanner: ${report.version || 'connected'}` : 'Scanner: waiting';
  }
  function discoverScannerReport() {
    try {
      if (window.AURELIX && typeof window.AURELIX.getReport === 'function') return window.AURELIX.getReport();
    } catch {}
    return null;
  }
  function flushVisiblePotionPolicies() {
    if (!isViewActive('resources')) return;
    const engine = window.AURELIX_ENGINE;
    if (!engine?.setPotionPolicy) return;
    $$('.ax-potion-select').forEach(select => {
      if (!select.dataset.potionKey) return;
      engine.setPotionPolicy(select.dataset.potionKey, { enabled: select.value === 'on' });
    });
    $$('.ax-potion-limit').forEach(input => {
      if (!input.dataset.potionKey) return;
      engine.setPotionPolicy(input.dataset.potionKey, { limit: Math.max(0, Math.floor(Number(input.value) || 0)) });
    });
  }
  function hydrateFromScanner(report) {
    if (!report) {
      renderScannerState();
      return;
    }
    renderScannerState();
    flushVisibleTargetLimits();
    flushVisiblePotionPolicies();
    if (window.AURELIX_ENGINE?.getTargetUiModels || window.AURELIX_ENGINE?.getTargetPolicies) {
      appState.targets = window.AURELIX_ENGINE.getTargetUiModels?.() || window.AURELIX_ENGINE.getTargetPolicies();
    } else {
      const entities = Array.isArray(report.entities) ? report.entities : [];
      appState.targets = entities
        .filter(e => e && e.targetEligible)
        .map((e, i) => ({
          ...e,
          key: e.entityId || String(i),
          enabled: false,
          damageLimit: 0,
          phase1DamageLimit: 0,
          phase3DamageLimit: 0,
          gateName: e.gateName || e.gate,
          waveName: e.waveDisplay || e.waveName || e.wave,
          dungeonName: e.dungeonName || e.dungeon,
          locationName: e.locationName || e.location
        }));
    }
    structuralDirty.targets = true;
    refreshLoadoutUi();
    if (isViewActive('combat') || !(appState.activeSkills || []).length) {
      const skillRefresh = window.AURELIX_ENGINE?.refreshActiveSkills?.(!(appState.activeSkills || []).length);
      if (skillRefresh && typeof skillRefresh.then === 'function') skillRefresh.then(skills => {
        if (Array.isArray(skills)) {
          appState.activeSkills = skills;
          structuralDirty.skills = true;
          renderStructuralIfVisible();
        }
      }).catch(() => {});
    }
    const models = window.AURELIX_ENGINE?.getPotionModels?.();
    const potions = Array.isArray(models) ? models : (report.potions || report.resources?.potions || []);
    if (potions) {
      const arr = Array.isArray(potions) ? potions : Object.values(potions);
      appState.potions.stamina = arr.filter(p => p.type === 'stamina' || /stamina/i.test(String(p.name || '')));
      appState.potions.mana = arr.filter(p => p.type === 'mana' || /\bmana\b|\bmp\b/i.test(String(p.name || '')));
      appState.potions.hp = arr.filter(p => p.type === 'hp' || /\bhp\b|health/i.test(String(p.name || '')));
      structuralDirty.potions = true;
    }
    renderStructuralIfVisible();
  }
  function normalizeEngineLogEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    let type = String(entry.type || 'system').toLowerCase();
    if (type === 'combat' || type === 'phase' || type === 'done') type = 'attack';
    if (!UI_LOG_TYPES.has(type)) type = 'system';
    const at = Date.parse(entry.at || '');
    return {
      time: Number.isFinite(at)
        ? new Date(at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})
        : new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}),
      type,
      message: String(entry.message || '')
    };
  }
  function appendEngineLogEntry(entry, renderIfVisible = true) {
    const normalized = normalizeEngineLogEntry(entry);
    if (!normalized) return false;
    appState.logs.push(normalized);
    if (appState.logs.length > 80) appState.logs.splice(0, appState.logs.length - 80);
    logsDirty = true;
    if (renderIfVisible && root.style.display !== 'none' && isViewActive('logs')) renderLogs();
    return true;
  }
  let engineLogCursor = 0;
  function syncEngineLogs() {
    const engine = window.AURELIX_ENGINE;
    if (!engine?.getLogs) return;
    let logs;
    try { logs = engine.getLogs(); } catch { return; }
    if (!Array.isArray(logs)) return;
    if (engineLogCursor > logs.length) engineLogCursor = 0;
    for (let i = engineLogCursor; i < logs.length; i++) appendEngineLogEntry(logs[i], false);
    engineLogCursor = logs.length;
    if (logsDirty && root.style.display !== 'none' && isViewActive('logs')) renderLogs();
  }
  let lastSkillSignature = '';
  let lastSkillTargetSignature = '';
  let lastLoadoutRuntimeSignature = '';
  function ingestEngineLog(entry) {
    appendEngineLogEntry(entry, true);
  }
  function syncExternalRuntime(runtimeOverride = null, { structural = false } = {}) {
    try {
      const engine = window.AURELIX_ENGINE;
      if (engine?.getUiState || engine?.getRuntimeState) {
        const runtime = runtimeOverride || engine.getUiState?.() || engine.getRuntimeState();
        if (!runtime) return;
        const wasRunning = appState.running;
        appState.running = !!runtime.running;
        if (wasRunning !== appState.running) mini.classList.toggle('ax-running', appState.running);
        if (runtime.currentTarget) {
          const t = runtime.currentTarget;
          appState.currentTarget = {
            ...t,
            status: runtime.running ? 'Selected' : 'Waiting',
            waveName: t.waveDisplay || t.waveName || t.waveId,
            actionDetail: runtime.currentPlan?.nextStage ? String(runtime.currentPlan.nextStage).replace(/-/g, ' ') : '—'
          };
        } else appState.currentTarget = null;
        if (runtime.summary) Object.assign(appState.summary, runtime.summary);
        if (runtime.activeLoadout || typeof runtime.loadoutInFlight === 'boolean') {
          const nextActive = runtime.activeLoadout || appState.loadouts.active;
          const nextBusy = !!runtime.loadoutInFlight;
          const signature = JSON.stringify([
            nextActive?.equipmentPresetId || '', nextActive?.petPresetId || '',
            !!nextActive?.detected, Number(nextActive?.checkedAt || 0), nextBusy
          ]);
          appState.loadouts.active = nextActive;
          appState.loadouts.busy = nextBusy;
          if (signature !== lastLoadoutRuntimeSignature) {
            lastLoadoutRuntimeSignature = signature;
            structuralDirty.presets = true;
            renderStructuralIfVisible();
          }
        }
        if (runtime.resources) {
          const r = runtime.resources;
          appState.resources.stamina = r.stamina ?? appState.resources.stamina;
          appState.resources.staminaMax = r.staminaMax ?? appState.resources.staminaMax;
          appState.resources.exp = r.exp ?? appState.resources.exp;
          appState.resources.expMax = r.expMax ?? appState.resources.expMax;
        }
        if (runtime.startedAt) {
          appState.startedAt = Date.parse(runtime.startedAt) || 0;
          appState.elapsedBeforeStop = runtime.elapsedMs || 0;
        }
        const settings = runtime.settings || {};
        if (settings.mode && settings.mode !== appState.mode) {
          appState.mode = settings.mode;
          $$('#ax-mode-grid .ax-choice-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === settings.mode));
        }
        if (typeof settings.autoLoot === 'boolean') {
          const autoLoot = $('#ax-auto-loot');
          if (autoLoot?.classList.contains('on') !== settings.autoLoot) autoLoot?.classList.toggle('on', settings.autoLoot);
        }
        if (Number.isFinite(Number(settings.expThreshold))) {
          const threshold = String(settings.expThreshold);
          const range = $('#ax-exp-threshold');
          const number = $('#ax-exp-threshold-num');
          if (range?.value !== threshold) range.value = threshold;
          if (number?.value !== threshold) number.value = threshold;
        }
        if (structural) {
          const full = engine.getRuntimeState?.();
          if (full) {
            if (Array.isArray(full.activeSkills)) {
              const sig = JSON.stringify(full.activeSkills.map(x => [x.key,x.enabled,x.behavior,x.manaCost,x.staminaDisplayCost]));
              if (sig !== lastSkillSignature) {
                lastSkillSignature = sig;
                appState.activeSkills = full.activeSkills;
                structuralDirty.skills = true;
                renderStructuralIfVisible();
              }
            }
            if (full.activeSkillTargets && typeof full.activeSkillTargets === 'object') {
              const sig = JSON.stringify(full.activeSkillTargets);
              if (sig !== lastSkillTargetSignature) {
                lastSkillTargetSignature = sig;
                for (const target of appState.targets) target.activeSkillEnabled = full.activeSkillTargets[target.key]?.enabled === true;
                structuralDirty.targets = true;
                renderStructuralIfVisible();
              }
            }
          }
        }
        const footerState = `AURELIX • ${runtime.state}`;
        if ($('#ax-footer-left')?.textContent !== footerState) $('#ax-footer-left').textContent = footerState;
        if (root.style.display !== 'none' && isViewActive('overview')) renderOverview();
        return;
      }
      const A = window.AURELIX;
      if (!A) return;
      const runtime = typeof A.getRuntimeState === 'function' ? A.getRuntimeState() : A.runtimeState;
      if (!runtime) return;
      if (runtime.currentTarget) appState.currentTarget = runtime.currentTarget;
      if (runtime.resources) {
        const r = runtime.resources;
        appState.resources.stamina = r.stamina ?? appState.resources.stamina;
        appState.resources.staminaMax = r.staminaMax ?? appState.resources.staminaMax;
        appState.resources.exp = r.exp ?? r.xp ?? appState.resources.exp;
        appState.resources.expMax = r.expMax ?? r.xpMax ?? appState.resources.expMax;
      }
      if (runtime.summary) Object.assign(appState.summary, runtime.summary);
      if (typeof runtime.running === 'boolean') appState.running = runtime.running;
      mini.classList.toggle('ax-running', appState.running);
      if (root.style.display !== 'none' && isViewActive('overview')) renderOverview();
    } catch (error) { console.error('[AURELIX UI] runtime sync failed', error); }
  }
  loadPreferences();
  bindPreferences();
  renderStructuralIfVisible();
  if (isViewActive('overview')) renderOverview();
  renderLogs();
  renderScannerState();
  addLog('system', `AURELIX UI v${VERSION} loaded.`);
  try { syncEngineLogs(); } catch {}
  try { syncExternalRuntime(null, { structural: true }); } catch {}
  let unsubscribeUiEngine = null;
  if (window.AURELIX_ENGINE?.subscribe) {
    unsubscribeUiEngine = window.AURELIX_ENGINE.subscribe(snapshot => {
      try { if (snapshot?.latestLog) ingestEngineLog(snapshot.latestLog); } catch {}
      try { syncExternalRuntime(snapshot); } catch {}
    });
  }
  let lastReportToken = null;
  let unsubscribeUiScanner = null;
  if (window.AURELIX?.subscribe) {
    unsubscribeUiScanner = window.AURELIX.subscribe(event => {
      if (event.type === 'scan-start') scannerBusy = true;
      if (event.type === 'scan-end' || event.type === 'scan-error') scannerBusy = false;
      renderScannerState();
      if (event.type === 'scan-complete' && event.report) {
        const token = `${event.report.scanSeq ?? ''}:${event.report.generatedAt ?? ''}`;
        if (token !== lastReportToken) {
          lastReportToken = token;
          try {
            hydrateFromScanner(event.report);
            syncExternalRuntime(null, { structural: true });
          } catch (error) { console.error('[AURELIX UI] scanner hydrate failed', error); }
        }
      }
    });
  }
  setInterval(() => {
    if (document.visibilityState === 'hidden' || root.style.display === 'none') return;
    try { if (isViewActive('overview')) renderRuntime(); } catch {}
  }, 1000);
  setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    try { renderScannerState(); } catch {}
    try {
      const report = discoverScannerReport();
      const token = report ? `${report.scanSeq ?? ''}:${report.generatedAt ?? ''}` : null;
      if (report && token !== lastReportToken) {
        lastReportToken = token;
        hydrateFromScanner(report);
        syncExternalRuntime(null, { structural: true });
      }
    } catch (error) {
      console.error('[AURELIX UI] scanner hydrate failed', error);
    }
  }, 15000);
  window.AURELIX_SELF_TEST = () => {
    const report = window.AURELIX?.getReport?.();
    const checks = {
      scannerApi: !!window.AURELIX?.scanNow,
      scannerSingleScheduler: !!window.AURELIX?.status?.().scheduled,
      engineApi: !!window.AURELIX_ENGINE?.getRuntimeState,
      uiShadowRoot: !!document.querySelector('#aurelix-host')?.shadowRoot,
      targetPoliciesReadable: false,
      potionPolicyReadable: false,
      combatApi: !!window.AURELIX_ENGINE?.runtimeEncounterKey,
      liveCombatEnabled: window.AURELIX_ENGINE?.getRuntimeState?.().liveActionsEnabled === true,
      attackIdle: window.AURELIX_ENGINE?.getRuntimeState?.().attackInFlight === false,
      reportPresent: !!report,
      reportErrors: Array.isArray(report?.errors) ? report.errors.length : null,
      persistenceBackend: typeof GM_getValue === 'function' && typeof GM_setValue === 'function' ? 'GM+localStorage' : 'localStorage',
      stablePotionPolicies: true,
      smartLootUsesRemainingExp: true,
      delegatedRowEvents: true,
      panelPointerIsolation: true,
      cookieOverrideWindowMinimized: true,
      potionPolicyScannerIndependent: true,
      dungeonLootPriority: true,
      dungeonLootCandidateFallback: true,
      bulkActiveSkillTargetSelection: !!window.AURELIX_ENGINE?.bulkSetActiveSkillTargetPolicies,
      lazyLogRendering: true,
      eventDrivenRuntimeSync: true
    };
    try { checks.targetPoliciesReadable = Array.isArray(window.AURELIX_ENGINE?.getTargetPolicies?.()); } catch {}
    try { checks.potionPolicyReadable = !!window.AURELIX_ENGINE?.getPotionPolicy?.(); } catch {}
    return checks;
  };
})();
