let slotIds = [1, 2, 3];
const MACRO_COUNT = 20;
const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

const hostInput = document.getElementById('host');
const portInput = document.getElementById('port');
const versionInput = document.getElementById('version');
const pingBtn = document.getElementById('pingBtn');
const pingResult = document.getElementById('pingResult');
const broadcastInput = document.getElementById('broadcastInput');
const broadcastBtn = document.getElementById('broadcastBtn');
const slotsContainer = document.getElementById('slots');
const template = document.getElementById('slot-template');
const convoyLeaderInput = document.getElementById('convoyLeader');
const convoyStartBtn = document.getElementById('convoyStartBtn');
const convoyStopBtn = document.getElementById('convoyStopBtn');
const convoyResult = document.getElementById('convoyResult');

const slotEls = {};

function emptyMacroList() {
  return new Array(MACRO_COUNT).fill('');
}

let store = {
  settings: { host: '', port: '', version: '', convoyLeader: '', slots: {} },
  macros: { global: emptyMacroList(), slots: { 1: emptyMacroList(), 2: emptyMacroList(), 3: emptyMacroList() } }
};

let saveTimer = null;
function persistStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.saveStore(store), 250);
}

function slotSettings(slotId) {
  if (!store.settings.slots[slotId]) store.settings.slots[slotId] = {};
  return store.settings.slots[slotId];
}

function slotMacros(slotId) {
  if (!store.macros.slots[slotId]) store.macros.slots[slotId] = emptyMacroList();
  return store.macros.slots[slotId];
}

const macroEditOverlay = document.getElementById('macroEditOverlay');
const macroEditInput = document.getElementById('macroEditInput');
const macroEditSave = document.getElementById('macroEditSave');
const macroEditClear = document.getElementById('macroEditClear');
const macroEditCancel = document.getElementById('macroEditCancel');
let macroEditCallback = null;

function openMacroEditor(currentValue, onSave) {
  macroEditCallback = onSave;
  macroEditInput.value = currentValue || '';
  macroEditOverlay.hidden = false;
  macroEditInput.focus();
  macroEditInput.select();
}

function closeMacroEditor() {
  macroEditOverlay.hidden = true;
  macroEditCallback = null;
}

macroEditSave.addEventListener('click', () => {
  if (macroEditCallback) macroEditCallback(macroEditInput.value.trim());
  closeMacroEditor();
});
macroEditClear.addEventListener('click', () => {
  if (macroEditCallback) macroEditCallback('');
  closeMacroEditor();
});
macroEditCancel.addEventListener('click', closeMacroEditor);
macroEditOverlay.addEventListener('click', (e) => {
  if (e.target === macroEditOverlay) closeMacroEditor();
});
macroEditInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') macroEditSave.click();
  if (e.key === 'Escape') closeMacroEditor();
});

function updateMacroButton(btn, command) {
  btn.textContent = command ? command : '—';
  btn.classList.toggle('bound', !!command);
  btn.title = command || 'ПКМ — назначить команду';
}

function buildMacroGrid(container, list, sendFn) {
  container.innerHTML = '';
  for (let i = 0; i < MACRO_COUNT; i++) {
    const btn = document.createElement('div');
    btn.className = 'macro-btn';
    btn.tabIndex = 0;
    updateMacroButton(btn, list[i]);

    btn.addEventListener('click', () => {
      const command = list[i];
      if (command) sendFn(command);
    });

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMacroEditor(list[i], (value) => {
        list[i] = value || '';
        updateMacroButton(btn, list[i]);
        persistStore();
      });
    });

    container.appendChild(btn);
  }
}

const addSlotCard = document.createElement('div');
addSlotCard.className = 'add-slot-card';
addSlotCard.textContent = '+ Добавить аккаунт';
addSlotCard.addEventListener('click', () => addSlot());
slotsContainer.appendChild(addSlotCard);

function addSlot() {
  const nextId = slotIds.length ? Math.max(...slotIds) + 1 : 1;
  slotIds.push(nextId);
  store.settings.slotIds = slotIds;
  persistStore();
  buildSlot(nextId);
  setStatus(nextId, 'offline');
  return nextId;
}

function removeSlot(slotId) {
  window.api.disconnect(slotId);

  const els = slotEls[slotId];
  if (els && els.root) els.root.remove();
  delete slotEls[slotId];

  slotIds = slotIds.filter((id) => id !== slotId);
  store.settings.slotIds = slotIds;
  if (store.settings.slots) delete store.settings.slots[slotId];
  if (store.macros.slots) delete store.macros.slots[slotId];
  persistStore();
}

function buildSlot(slotId) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.slot = String(slotId);
  node.querySelector('.slot-title').textContent = `Аккаунт ${slotId}`;
  slotsContainer.insertBefore(node, addSlotCard);

  const els = {
    root: node,
    status: node.querySelector('.status-badge'),
    statusDot: node.querySelector('.status-dot'),
    username: node.querySelector('.username-input'),
    auth: node.querySelector('.auth-select'),
    connectBtn: node.querySelector('.connect-btn'),
    disconnectBtn: node.querySelector('.disconnect-btn'),
    log: node.querySelector('.log-box'),
    chatInput: node.querySelector('.chat-input'),
    sendBtn: node.querySelector('.send-btn'),
    proxyEnabled: node.querySelector('.proxy-enabled'),
    proxyFields: node.querySelector('.proxy-fields'),
    proxyType: node.querySelector('.proxy-type'),
    proxyHost: node.querySelector('.proxy-host'),
    proxyPort: node.querySelector('.proxy-port'),
    proxyUser: node.querySelector('.proxy-user'),
    proxyPass: node.querySelector('.proxy-pass'),
    proxyCheckBtn: node.querySelector('.proxy-check-btn'),
    proxyCheckResult: node.querySelector('.proxy-check-result'),
    macroGrid: node.querySelector('.slot-macro-grid'),
    removeBtn: node.querySelector('.slot-remove-btn')
  };
  slotEls[slotId] = els;

  els.removeBtn.addEventListener('click', () => removeSlot(slotId));

  els.autoScroll = true;
  els.scrollResumeTimer = null;
  els.log.addEventListener('scroll', () => {
    const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 6;
    clearTimeout(els.scrollResumeTimer);
    if (atBottom) {
      els.autoScroll = true;
    } else {
      els.autoScroll = false;
      els.scrollResumeTimer = setTimeout(() => {
        els.autoScroll = true;
        els.log.scrollTop = els.log.scrollHeight;
      }, 10000);
    }
  });

  els.log.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const line = e.target.closest('.log-line');
    if (!line) return;
    const text = line.dataset.copyText || line.textContent;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        line.classList.add('copied');
        setTimeout(() => line.classList.remove('copied'), 400);
      })
      .catch(() => {});
  });

  els.log.addEventListener('click', (e) => {
    const link = e.target.closest('.chat-link');
    if (link && link.dataset.url) window.api.openExternal(link.dataset.url);
  });

  buildMacroGrid(els.macroGrid, slotMacros(slotId), (command) => window.api.sendChat(slotId, command));

  const saved = slotSettings(slotId);
  if (saved.username != null) els.username.value = saved.username;
  if (saved.auth != null) els.auth.value = saved.auth;
  if (saved.proxyEnabled) els.proxyEnabled.checked = true;
  if (saved.proxyType != null) els.proxyType.value = saved.proxyType;
  if (saved.proxyHost != null) els.proxyHost.value = saved.proxyHost;
  if (saved.proxyPort != null) els.proxyPort.value = saved.proxyPort;
  if (saved.proxyUser != null) els.proxyUser.value = saved.proxyUser;
  if (saved.proxyPass != null) els.proxyPass.value = saved.proxyPass;
  els.proxyFields.hidden = !els.proxyEnabled.checked;

  const persistField = (el, key, event = 'input') => {
    el.addEventListener(event, () => {
      slotSettings(slotId)[key] = el.type === 'checkbox' ? el.checked : el.value;
      persistStore();
    });
  };
  persistField(els.username, 'username');
  persistField(els.auth, 'auth', 'change');
  persistField(els.proxyType, 'proxyType', 'change');
  persistField(els.proxyHost, 'proxyHost');
  persistField(els.proxyPort, 'proxyPort');
  persistField(els.proxyUser, 'proxyUser');
  persistField(els.proxyPass, 'proxyPass');

  els.proxyEnabled.addEventListener('change', () => {
    els.proxyFields.hidden = !els.proxyEnabled.checked;
    slotSettings(slotId).proxyEnabled = els.proxyEnabled.checked;
    persistStore();
  });

  els.connectBtn.addEventListener('click', () => {
    const username = els.username.value.trim();
    if (!username) {
      appendLog(slotId, 'Укажите ник перед подключением', 'warn');
      return;
    }

    const proxy = getProxyConfig(slotId);
    if (proxy) {
      if (!proxy.host || !proxy.port) {
        appendLog(slotId, 'Заполните хост и порт прокси или отключите прокси для этого аккаунта', 'warn');
        return;
      }
      if (!versionInput.value.trim()) {
        appendLog(slotId, 'При прокси версию сервера нужно указать вручную (поле "Версия" вверху)', 'warn');
        return;
      }
    }

    window.api.connect(slotId, {
      host: hostInput.value.trim(),
      port: portInput.value.trim(),
      version: versionInput.value.trim(),
      username,
      auth: els.auth.value,
      proxy
    });
  });

  els.disconnectBtn.addEventListener('click', () => {
    window.api.disconnect(slotId);
  });

  els.sendBtn.addEventListener('click', () => sendFromSlot(slotId));
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendFromSlot(slotId);
  });

  els.proxyCheckBtn.addEventListener('click', async () => {
    const proxy = getProxyConfig(slotId);
    if (!proxy || !proxy.host || !proxy.port) {
      els.proxyCheckResult.textContent = 'Заполните хост и порт прокси';
      return;
    }
    els.proxyCheckResult.textContent = 'Проверка...';
    const result = await window.api.checkProxy(proxy);
    els.proxyCheckResult.textContent = result.ok ? `IP через прокси: ${result.ip}` : `Ошибка: ${result.error}`;
  });
}

function getProxyConfig(slotId) {
  const els = slotEls[slotId];
  if (!els.proxyEnabled.checked) return null;
  return {
    type: els.proxyType.value,
    host: els.proxyHost.value.trim(),
    port: els.proxyPort.value.trim(),
    username: els.proxyUser.value.trim(),
    password: els.proxyPass.value
  };
}

function sendFromSlot(slotId) {
  const els = slotEls[slotId];
  const message = els.chatInput.value.trim();
  if (!message) return;
  window.api.sendChat(slotId, message);
  els.chatInput.value = '';
}

function linkify(html) {
  return html.replace(URL_PATTERN, (url) => `<span class="chat-link" data-url="${url}">${url}</span>`);
}

function appendLog(slotId, text, kind, html) {
  const els = slotEls[slotId];
  if (!els) return;
  const line = document.createElement('div');
  line.className = `log-line log-${kind || 'info'}`;
  line.dataset.copyText = text;
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  if (kind === 'chat' && html) {
    line.innerHTML = `[${time}] ${linkify(html)}`;
  } else {
    line.textContent = `[${time}] ${text}`;
  }
  els.log.appendChild(line);
  if (els.autoScroll) {
    els.log.scrollTop = els.log.scrollHeight;
  }
}

function setStatus(slotId, status) {
  const els = slotEls[slotId];
  if (!els) return;

  const labels = {
    offline: 'Оффлайн',
    connecting: 'Подключение...',
    online: 'В сети',
    error: 'Ошибка'
  };

  els.status.className = `status-badge status-${status}`;
  els.status.textContent = labels[status] || status;
  els.statusDot.className = `status-dot status-dot-${status}`;

  const online = status === 'online';
  const busy = status === 'connecting';

  els.connectBtn.disabled = busy || online;
  els.disconnectBtn.disabled = !online && !busy;
  els.chatInput.disabled = !online;
  els.sendBtn.disabled = !online;
  els.username.disabled = busy || online;
  els.auth.disabled = busy || online;

  const proxyLocked = busy || online;
  els.proxyEnabled.disabled = proxyLocked;
  [els.proxyType, els.proxyHost, els.proxyPort, els.proxyUser, els.proxyPass, els.proxyCheckBtn].forEach(
    (el) => (el.disabled = proxyLocked)
  );
}

window.api.onStatus(({ slotId, status }) => setStatus(slotId, status));
window.api.onLog(({ slotId, text, kind, html }) => appendLog(slotId, text, kind, html));
window.api.onMsaCode(({ slotId, verification_uri, user_code }) => {
  appendLog(slotId, `Откройте ${verification_uri} и введите код ${user_code}`, 'auth');
});

pingBtn.addEventListener('click', async () => {
  const host = hostInput.value.trim();
  if (!host) {
    pingResult.textContent = 'Укажите адрес сервера';
    return;
  }
  pingResult.textContent = 'Проверка...';
  const result = await window.api.pingServer(host, portInput.value.trim());
  if (result.ok) {
    pingResult.textContent = `Онлайн: ${result.latency} мс, версия ${result.version}, игроков ${result.players}`;
  } else {
    pingResult.textContent = `Недоступен: ${result.error}`;
  }
});

broadcastBtn.addEventListener('click', sendBroadcast);
broadcastInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBroadcast();
});

async function sendBroadcast() {
  const message = broadcastInput.value.trim();
  if (!message) return;
  const sent = await window.api.sendChatAll(message);
  if (!sent) {
    pingResult.textContent = 'Нет подключённых аккаунтов для рассылки';
  }
  broadcastInput.value = '';
}

convoyStartBtn.addEventListener('click', async () => {
  const leader = convoyLeaderInput.value.trim();
  if (!leader) {
    convoyResult.textContent = 'Укажите ник игрока для слежки';
    return;
  }
  const count = await window.api.startConvoy(leader);
  convoyResult.textContent = count
    ? `Конвой запущен: ${count} аккаунт(ов) выстроились паровозиком за ${leader}`
    : 'Нет подключённых аккаунтов для конвоя';
});

convoyStopBtn.addEventListener('click', async () => {
  await window.api.stopConvoy();
  convoyResult.textContent = 'Конвой остановлен';
});

document.getElementById('winMin').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('winMax').addEventListener('click', () => window.api.maximizeToggleWindow());
document.getElementById('winClose').addEventListener('click', () => window.api.closeWindow());

window.api.onWindowState(({ maximized }) => {
  document.getElementById('winMax').classList.toggle('is-maximized', maximized);
});

async function init() {
  const loaded = await window.api.loadStore();
  if (loaded && loaded.settings) store.settings = { slots: {}, ...loaded.settings };
  if (!store.settings.slots) store.settings.slots = {};
  if (loaded && loaded.macros && Array.isArray(loaded.macros.global) && loaded.macros.slots) {
    store.macros = loaded.macros;
  }

  hostInput.value = store.settings.host || '';
  portInput.value = store.settings.port || '';
  versionInput.value = store.settings.version || '';
  convoyLeaderInput.value = store.settings.convoyLeader || '';

  hostInput.addEventListener('input', () => {
    store.settings.host = hostInput.value;
    persistStore();
  });
  portInput.addEventListener('input', () => {
    store.settings.port = portInput.value;
    persistStore();
  });
  versionInput.addEventListener('input', () => {
    store.settings.version = versionInput.value;
    persistStore();
  });
  convoyLeaderInput.addEventListener('input', () => {
    store.settings.convoyLeader = convoyLeaderInput.value;
    persistStore();
  });

  if (Array.isArray(store.settings.slotIds) && store.settings.slotIds.length) {
    slotIds = store.settings.slotIds.slice().sort((a, b) => a - b);
  }
  store.settings.slotIds = slotIds;

  slotIds.forEach(buildSlot);
  slotIds.forEach((id) => setStatus(id, 'offline'));

  buildMacroGrid(document.getElementById('globalMacroGrid'), store.macros.global, (command) =>
    window.api.sendChatAll(command)
  );
}

init();
