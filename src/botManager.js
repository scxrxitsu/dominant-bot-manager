const mineflayer = require('mineflayer');
const mcProtocol = require('minecraft-protocol');
const { createProxySocket } = require('./proxy');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalFollow } = goals;

class BotManager {
  constructor(sendToRenderer) {
    this.sendToRenderer = sendToRenderer;
    this.slots = new Map();
  }

  _emitStatus(slotId, status, extra = {}) {
    const prev = this.slots.get(slotId) || {};
    this.slots.set(slotId, { ...prev, status, ...extra });
    this.sendToRenderer('bot:status', { slotId, status });
  }

  _emitLog(slotId, text, kind = 'info', html = null) {
    this.sendToRenderer('bot:log', { slotId, text, kind, html, time: Date.now() });
  }

  async connect(slotId, config) {
    const existing = this.slots.get(slotId);
    if (existing && existing.bot) {
      this._emitLog(slotId, 'Бот уже подключён или подключается', 'warn');
      return;
    }

    const { host, port, username, auth, version, proxy } = config;
    const proxyEnabled = !!(proxy && proxy.host);

    if (!host || !username) {
      this._emitLog(slotId, 'Не указан адрес сервера или ник', 'error');
      return;
    }

    if (proxyEnabled && !version) {
      this._emitLog(
        slotId,
        'При подключении через прокси версию сервера нужно указать вручную (автоопределение идёт в обход прокси)',
        'error'
      );
      return;
    }

    this._emitStatus(slotId, 'connecting');
    this.slots.set(slotId, { bot: null, config, status: 'connecting' });

    let stream = null;
    if (proxyEnabled) {
      this._emitLog(slotId, `Подключение через ${proxy.type.toUpperCase()}-прокси ${proxy.host}:${proxy.port}...`, 'info');
      try {
        stream = await createProxySocket(proxy, host, port ? Number(port) : 25565);
      } catch (err) {
        this._emitStatus(slotId, 'error');
        this._emitLog(slotId, `Ошибка прокси: ${err.message}`, 'error');
        return;
      }
      if (!this.slots.has(slotId) || this.slots.get(slotId).status !== 'connecting') {
        stream.destroy();
        return;
      }
    }

    this._emitLog(slotId, `Подключение к ${host}:${port || 25565} как ${username}...`);

    let bot;
    try {
      bot = mineflayer.createBot({
        host,
        port: port ? Number(port) : 25565,
        username,
        auth: auth || 'offline',
        version: version || false,
        hideErrors: true,
        ...(stream ? { stream } : {}),
        onMsaCode: (data) => {
          this._emitLog(
            slotId,
            `Microsoft вход: откройте ${data.verification_uri} и введите код ${data.user_code}`,
            'auth'
          );
          this.sendToRenderer('bot:msaCode', { slotId, ...data });
        }
      });
    } catch (err) {
      this._emitStatus(slotId, 'error');
      this._emitLog(slotId, `Ошибка создания бота: ${err.message}`, 'error');
      return;
    }

    this.slots.set(slotId, { bot, config, status: 'connecting' });
    bot.loadPlugin(pathfinder);

    bot.once('login', () => {
      this._emitLog(slotId, 'Вход выполнен, ожидание спавна...', 'success');
    });

    bot.once('spawn', () => {
      this._emitStatus(slotId, 'online');
      this._emitLog(slotId, `В игре как ${bot.username}`, 'success');
      bot.pathfinder.setMovements(new Movements(bot));
    });

    bot.on('message', (jsonMsg) => {
      const text = jsonMsg.toString();
      if (!text.trim().length) return;
      let html = null;
      try {
        html = jsonMsg.toHTML();
      } catch {
        html = null;
      }
      this._emitLog(slotId, text, 'chat', html);
    });

    bot.on('kicked', (reason) => {
      let reasonText;
      try {
        reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
      } catch {
        reasonText = String(reason);
      }
      this._emitLog(slotId, `Кикнут с сервера: ${reasonText}`, 'error');
    });

    bot.on('error', (err) => {
      this._emitStatus(slotId, 'error');
      this._emitLog(slotId, `Ошибка: ${err.message}`, 'error');
    });

    bot.on('end', (reason) => {
      this._emitStatus(slotId, 'offline');
      this._emitLog(slotId, `Отключён${reason ? ': ' + reason : ''}`, 'warn');
      const s = this.slots.get(slotId);
      if (s) {
        if (s.followInterval) clearInterval(s.followInterval);
        s.followInterval = null;
        s.followTarget = null;
        s.bot = null;
      }
    });
  }

  disconnect(slotId) {
    const s = this.slots.get(slotId);
    if (!s) {
      this._emitLog(slotId, 'Бот не подключён', 'warn');
      return;
    }
    if (s.bot) {
      try {
        s.bot.quit('Отключено пользователем');
      } catch (err) {
        this._emitLog(slotId, `Ошибка при отключении: ${err.message}`, 'error');
      }
      try {
        // quit() alone waits for a graceful close; force the socket shut so the
        // UI doesn't sit showing "online" while the server takes its time.
        const socket = s.bot._client && s.bot._client.socket;
        if (socket && !socket.destroyed) socket.destroy();
      } catch (err) {
        this._emitLog(slotId, `Ошибка при принудительном отключении: ${err.message}`, 'error');
      }
      return;
    }
    if (s.status === 'connecting') {
      this._emitStatus(slotId, 'offline');
      this._emitLog(slotId, 'Подключение отменено', 'warn');
      return;
    }
    this._emitLog(slotId, 'Бот не подключён', 'warn');
  }

  sendChat(slotId, message) {
    const s = this.slots.get(slotId);
    if (!s || !s.bot || s.status !== 'online') {
      this._emitLog(slotId, 'Нельзя отправить сообщение: бот не в сети', 'warn');
      return false;
    }
    s.bot.chat(message);
    this._emitLog(slotId, `> ${message}`, 'self');
    return true;
  }

  sendChatToAll(message) {
    let sentCount = 0;
    for (const [slotId, s] of this.slots.entries()) {
      if (s.bot && s.status === 'online') {
        s.bot.chat(message);
        this._emitLog(slotId, `> ${message}`, 'self');
        sentCount++;
      }
    }
    return sentCount;
  }

  disconnectAll() {
    for (const slotId of this.slots.keys()) {
      this.disconnect(slotId);
    }
  }

  followUsername(slotId, targetUsername) {
    const s = this.slots.get(slotId);
    if (!s || !s.bot || s.status !== 'online') {
      this._emitLog(slotId, 'Нельзя начать следование: бот не в сети', 'warn');
      return false;
    }
    const bot = s.bot;
    if (s.followInterval) clearInterval(s.followInterval);

    const tryFollow = () => {
      const player = bot.players[targetUsername];
      const target = player && player.entity;
      if (!target) return false;
      bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
      return true;
    };

    const found = tryFollow();
    this._emitLog(
      slotId,
      found ? `Следую за ${targetUsername}` : `Игрок ${targetUsername} пока не виден, жду появления...`,
      found ? 'success' : 'warn'
    );

    s.followTarget = targetUsername;
    s.followInterval = setInterval(() => {
      const current = this.slots.get(slotId);
      if (!current || !current.bot || current.status !== 'online') {
        clearInterval(s.followInterval);
        return;
      }
      tryFollow();
    }, 3000);
    return true;
  }

  stopFollow(slotId) {
    const s = this.slots.get(slotId);
    if (!s) return;
    if (s.followInterval) {
      clearInterval(s.followInterval);
      s.followInterval = null;
    }
    s.followTarget = null;
    if (s.bot && s.bot.pathfinder) {
      s.bot.pathfinder.setGoal(null);
    }
    this._emitLog(slotId, 'Следование остановлено', 'info');
  }

  startConvoy(leaderUsername) {
    if (!leaderUsername) return 0;
    const allSlotIds = [...this.slots.keys()].sort((a, b) => a - b);
    const onlineSlots = allSlotIds.filter((id) => {
      const s = this.slots.get(id);
      return s && s.bot && s.status === 'online';
    });
    let previousUsername = leaderUsername;
    for (const slotId of onlineSlots) {
      this.followUsername(slotId, previousUsername);
      previousUsername = this.slots.get(slotId).config.username;
    }
    return onlineSlots.length;
  }

  stopConvoy() {
    for (const slotId of this.slots.keys()) this.stopFollow(slotId);
  }

  pingServer(host, port) {
    return new Promise((resolve) => {
      if (!host) {
        resolve({ ok: false, error: 'Не указан адрес сервера' });
        return;
      }
      const start = Date.now();
      mcProtocol.ping({ host, port: port ? Number(port) : 25565 }, (err, response) => {
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }
        const latency = Date.now() - start;
        resolve({
          ok: true,
          latency,
          motd: response.description
            ? typeof response.description === 'string'
              ? response.description
              : JSON.stringify(response.description)
            : '',
          version: response.version ? response.version.name : 'unknown',
          players: response.players ? `${response.players.online}/${response.players.max}` : 'unknown'
        });
      });
    });
  }
}

module.exports = BotManager;
