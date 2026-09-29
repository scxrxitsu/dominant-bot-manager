const net = require('net');
const https = require('https');
const { SocksClient } = require('socks');

function buildProxyUrl(proxy) {
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
    : '';
  const scheme = proxy.type === 'http' ? 'http' : proxy.type === 'socks4' ? 'socks4' : 'socks5';
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

function createHttpConnectSocket(proxy, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: Number(proxy.port) }, () => {
      let authHeader = '';
      if (proxy.username) {
        const token = Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64');
        authHeader = `Proxy-Authorization: Basic ${token}\r\n`;
      }
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${authHeader}Connection: keep-alive\r\n\r\n`
      );
    });

    let buffered = Buffer.alloc(0);

    function onData(chunk) {
      buffered = Buffer.concat([buffered, chunk]);
      const headerEnd = buffered.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      socket.removeListener('data', onData);
      const header = buffered.slice(0, headerEnd).toString('utf8');
      const statusLine = header.split('\r\n')[0];
      const statusMatch = statusLine.match(/\s(\d{3})\s/);

      if (!statusMatch || statusMatch[1] !== '200') {
        socket.destroy();
        reject(new Error(`Прокси отклонил CONNECT: ${statusLine}`));
        return;
      }

      const rest = buffered.slice(headerEnd + 4);
      if (rest.length) socket.unshift(rest);
      resolve(socket);
    }

    socket.on('data', onData);
    socket.once('error', reject);
    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('Таймаут подключения к прокси'));
    });
  });
}

async function createProxySocket(proxy, targetHost, targetPort) {
  if (proxy.type === 'http') {
    return createHttpConnectSocket(proxy, targetHost, targetPort);
  }

  const socksType = proxy.type === 'socks4' ? 4 : 5;
  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: proxy.host,
      port: Number(proxy.port),
      type: socksType,
      userId: proxy.username || undefined,
      password: proxy.password || undefined
    },
    command: 'connect',
    destination: { host: targetHost, port: Number(targetPort) },
    timeout: 10000
  });

  return socket;
}

async function checkProxyIp(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    return { ok: false, error: 'Не указан адрес или порт прокси' };
  }

  let agent;
  try {
    const url = buildProxyUrl(proxy);
    if (proxy.type === 'http') {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      agent = new HttpsProxyAgent(url);
    } else {
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      agent = new SocksProxyAgent(url);
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    const req = https.get(
      { hostname: 'api.ipify.org', path: '/?format=json', agent, timeout: 10000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ ok: true, ip: parsed.ip });
          } catch {
            resolve({ ok: false, error: 'Некорректный ответ сервиса проверки IP' });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Таймаут проверки прокси' });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

module.exports = { createProxySocket, checkProxyIp };
