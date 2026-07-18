import Foundation
import Network

final class LiveUIServer {
    private let port: UInt16
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "fold.streaming-asr-benchmark.live-ui")
    private let lock = NSLock()
    private var eventConnections: [NWConnection] = []
    private var session: LiveStreamingSession?
    private var multiSession: MultiLiveStreamingSession?
    private var activeEngineName: String?
    private var latestResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")

    init(port: UInt16) throws {
        self.port = port
    }

    func start() throws {
        let listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection)
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            self.route(request: request, connection: connection)
        }
    }

    private func route(request: String, connection: NWConnection) {
        let line = request.components(separatedBy: "\r\n").first ?? ""
        let parts = line.split(separator: " ")
        guard parts.count >= 2 else {
            sendText("Bad request", status: "400 Bad Request", connection: connection)
            return
        }
        let method = String(parts[0])
        let target = String(parts[1])
        let url = URLComponents(string: "http://localhost\(target)")
        let path = url?.path ?? target

        switch (method, path) {
        case ("GET", "/"):
            sendHTML(liveHTML, connection: connection)
        case ("GET", "/events"):
            registerEventStream(connection)
        case ("GET", "/state"):
            sendJSON(statePayload(), connection: connection)
        case ("GET", "/engines"):
            sendJSON(EngineRegistry.descriptors, connection: connection)
        case ("POST", "/start"):
            let engineName = url?.queryItems?.first(where: { $0.name == "engine" })?.value ?? "sherpa_zipformer"
            Task { await start(engineName: engineName, connection: connection) }
        case ("POST", "/start-all"):
            Task { await startAll(connection: connection) }
        case ("POST", "/stop"):
            Task { await stop(connection: connection) }
        default:
            sendText("Not found", status: "404 Not Found", connection: connection)
        }
    }

    private func registerEventStream(_ connection: NWConnection) {
        let headers = """
        HTTP/1.1 200 OK\r
        Content-Type: text/event-stream; charset=utf-8\r
        Cache-Control: no-cache\r
        Connection: keep-alive\r
        Access-Control-Allow-Origin: *\r
        \r
        """
        connection.send(content: headers.data(using: .utf8), completion: .contentProcessed { _ in })
        lock.lock()
        eventConnections.append(connection)
        lock.unlock()
        sendEvent(name: "state", payload: statePayload())
    }

    private func start(engineName: String, connection: NWConnection) async {
        do {
            _ = try await stopExistingSession()
            let engine = try makeLiveEngine(named: engineName)
            let warmupStart = ContinuousClock.now
            try await engine.prepare()
            let warmupMs = wallClockMs(from: warmupStart, to: .now)
            let liveSession = LiveStreamingSession(engine: engine)
            try liveSession.start { [weak self] result in
                self?.latestResult = result
                self?.sendEvent(name: "partial", payload: result)
            }
            setSession(liveSession, engineName: engineName)
            let payload = LiveStatusPayload(ok: true, message: "已启动 \(engineName)，预热 \(String(format: "%.0f", warmupMs)) ms")
            sendJSON(payload, connection: connection)
            sendEvent(name: "status", payload: payload)
            sendEvent(name: "state", payload: statePayload())
        } catch {
            let payload = LiveStatusPayload(ok: false, message: "\(error)")
            sendJSON(payload, status: "500 Internal Server Error", connection: connection)
            sendEvent(name: "status", payload: payload)
        }
    }

    private func startAll(connection: NWConnection) async {
        do {
            _ = try await stopExistingSession()
            let ids = EngineRegistry.liveReadyEngineIds
            let liveSession = MultiLiveStreamingSession(engineIds: ids)
            setMultiSession(liveSession)
            try await liveSession.start(
                onStatus: { [weak self] status in
                    self?.sendEvent(name: "model-status", payload: status)
                },
                onUpdate: { [weak self] update in
                    self?.sendEvent(name: "model-update", payload: update)
                }
            )
            let payload = LiveStatusPayload(ok: true, message: "已启动 3 个真实流式模型")
            sendJSON(payload, connection: connection)
            sendEvent(name: "status", payload: payload)
            sendEvent(name: "state", payload: statePayload())
        } catch {
            let payload = LiveStatusPayload(ok: false, message: "\(error)")
            sendJSON(payload, status: "500 Internal Server Error", connection: connection)
            sendEvent(name: "status", payload: payload)
        }
    }

    private func stop(connection: NWConnection) async {
        do {
            let final = try await stopExistingSession()
            let payload = LiveStopPayload(ok: true, final: final)
            sendJSON(payload, connection: connection)
            sendEvent(name: "final", payload: payload)
            sendEvent(name: "state", payload: statePayload())
        } catch {
            let payload = LiveStatusPayload(ok: false, message: "\(error)")
            sendJSON(payload, status: "500 Internal Server Error", connection: connection)
            sendEvent(name: "status", payload: payload)
        }
    }

    private func stopExistingSession() async throws -> StreamingASRResult {
        if let multi = clearMultiSession() {
            await multi.stop { [weak self] status in
                self?.sendEvent(name: "model-status", payload: status)
            }
        }
        let existing = clearSession()
        guard let existing else {
            return latestResult
        }
        let final = try await existing.stop()
        latestResult = final
        return final
    }

    private func setSession(_ newSession: LiveStreamingSession, engineName: String) {
        lock.lock()
        session = newSession
        multiSession = nil
        activeEngineName = engineName
        latestResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
        lock.unlock()
    }

    private func setMultiSession(_ newSession: MultiLiveStreamingSession) {
        lock.lock()
        session = nil
        multiSession = newSession
        activeEngineName = "all"
        latestResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
        lock.unlock()
    }

    private func clearSession() -> LiveStreamingSession? {
        lock.lock()
        let existing = session
        session = nil
        activeEngineName = nil
        lock.unlock()
        return existing
    }

    private func clearMultiSession() -> MultiLiveStreamingSession? {
        lock.lock()
        let existing = multiSession
        multiSession = nil
        activeEngineName = nil
        lock.unlock()
        return existing
    }

    private func makeLiveEngine(named name: String) throws -> StreamingASREngine {
        guard let descriptor = EngineRegistry.descriptor(id: name),
              descriptor.capabilities.contains(.liveStreaming) else {
            throw ASREngineError.adapterUnavailable("No live streaming adapter registered for \(name)")
        }
        return EngineRegistry.makeEngine(id: name)
    }

    private func statePayload() -> LiveStatePayload {
        lock.lock()
        defer { lock.unlock() }
        return LiveStatePayload(
            running: session != nil,
            multiRunning: multiSession != nil,
            engine: activeEngineName,
            result: latestResult
        )
    }

    private func sendEvent<T: Encodable>(name: String, payload: T) {
        guard let json = try? String(data: JSONEncoder().encode(payload), encoding: .utf8) else {
            return
        }
        let data = "event: \(name)\ndata: \(json)\n\n".data(using: .utf8)
        lock.lock()
        let connections = eventConnections
        lock.unlock()
        for connection in connections {
            connection.send(content: data, completion: .contentProcessed { _ in })
        }
    }

    private func sendHTML(_ html: String, connection: NWConnection) {
        sendData(html.data(using: .utf8)!, contentType: "text/html; charset=utf-8", connection: connection)
    }

    private func sendText(_ text: String, status: String = "200 OK", connection: NWConnection) {
        sendData(text.data(using: .utf8)!, status: status, contentType: "text/plain; charset=utf-8", connection: connection)
    }

    private func sendJSON<T: Encodable>(_ payload: T, status: String = "200 OK", connection: NWConnection) {
        let data = (try? JSONEncoder().encode(payload)) ?? Data("{}".utf8)
        sendData(data, status: status, contentType: "application/json; charset=utf-8", connection: connection)
    }

    private func sendData(_ data: Data, status: String = "200 OK", contentType: String, connection: NWConnection) {
        let headers = [
            "HTTP/1.1 \(status)",
            "Content-Type: \(contentType)",
            "Access-Control-Allow-Origin: *",
            "Connection: close",
            "",
            ""
        ].joined(separator: "\r\n")
        var response = Data(headers.utf8)
        response.append(data)
        connection.send(content: response, isComplete: true, completion: .contentProcessed { _ in
            DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(100)) {
                connection.cancel()
            }
        })
    }
}

private struct LiveStatusPayload: Codable {
    let ok: Bool
    let message: String
}

private struct LiveStopPayload: Codable {
    let ok: Bool
    let final: StreamingASRResult
}

private struct LiveStatePayload: Codable {
    let running: Bool
    let multiRunning: Bool
    let engine: String?
    let result: StreamingASRResult
}

private let liveHTML = """
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fold 本地流式 ASR Benchmark</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101114; color: #f4f4f5; }
    body { margin: 0; min-height: 100vh; background: #101114; }
    main { max-width: 1040px; margin: 0 auto; padding: 28px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    h1 { font-size: 22px; margin: 0; font-weight: 650; }
    .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    select, button { height: 36px; border-radius: 6px; border: 1px solid #3f3f46; background: #18181b; color: #fafafa; padding: 0 12px; font-size: 14px; }
    button { cursor: pointer; background: #2563eb; border-color: #2563eb; }
    button.secondary { background: #27272a; border-color: #3f3f46; }
    button:disabled { opacity: .5; cursor: default; }
    .status { font-size: 13px; color: #a1a1aa; }
    .surface { border: 1px solid #303036; border-radius: 8px; background: #18181b; min-height: 220px; padding: 22px; line-height: 1.9; font-size: 28px; }
    .stable { color: #fafafa; }
    .unstable { color: #fbbf24; border-bottom: 1px dashed #fbbf24; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
    .model-card { border: 1px solid #303036; border-radius: 8px; background: #151518; padding: 16px; min-height: 220px; }
    .model-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 12px; }
    .model-title { font-size: 14px; font-weight: 650; }
    .model-status { font-size: 12px; color: #a1a1aa; text-align: right; }
    .model-output { min-height: 92px; line-height: 1.7; font-size: 18px; color: #fafafa; word-break: break-word; }
    .model-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .metric { border-top: 1px solid #27272a; padding-top: 8px; }
    .metric-label { display: block; font-size: 10px; color: #71717a; text-transform: uppercase; }
    .metric-value { display: block; font-size: 13px; color: #e4e4e7; margin-top: 2px; }
    section { border: 1px solid #303036; border-radius: 8px; background: #151518; padding: 16px; }
    h2 { margin: 0 0 10px; font-size: 13px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 13px; color: #d4d4d8; max-height: 240px; overflow: auto; }
    @media (max-width: 760px) { main { padding: 18px; } header { align-items: flex-start; flex-direction: column; } .grid, .cards { grid-template-columns: 1fr; } .surface { font-size: 22px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Fold 本地流式 ASR 测试</h1>
        <div class="status" id="status">空闲</div>
      </div>
      <div class="controls">
        <select id="engine"></select>
        <button id="start">开始单模型</button>
        <button id="startAll">同时测试可用模型（3）</button>
        <button class="secondary" id="stop" disabled>停止</button>
      </div>
    </header>

    <div class="surface" aria-live="polite">
      <span class="stable" id="stable"></span><span class="unstable" id="unstable"></span>
    </div>

    <div class="cards" id="cards"></div>

    <div class="grid">
      <section>
        <h2>当前完整 Partial</h2>
        <pre id="full"></pre>
      </section>
      <section>
        <h2>事件日志</h2>
        <pre id="events"></pre>
      </section>
    </div>
  </main>

  <script>
    const statusEl = document.getElementById('status');
    const stableEl = document.getElementById('stable');
    const unstableEl = document.getElementById('unstable');
    const fullEl = document.getElementById('full');
    const eventsEl = document.getElementById('events');
    const startButton = document.getElementById('start');
    const startAllButton = document.getElementById('startAll');
    const stopButton = document.getElementById('stop');
    const engineSelect = document.getElementById('engine');
    const cardsEl = document.getElementById('cards');
    let engineDescriptors = [];
    const modelState = new Map();

    function log(line) {
      const stamp = new Date().toLocaleTimeString();
      eventsEl.textContent = `[${stamp}] ${line}\\n` + eventsEl.textContent;
    }

    function render(result) {
      stableEl.textContent = result?.stableText || '';
      unstableEl.textContent = result?.unstableText || '';
      fullEl.textContent = result?.fullText || '';
    }

    function setRunning(running, engine) {
      const selected = selectedDescriptor();
      const live = selected ? selected.capabilities.includes('live_streaming') : true;
      startButton.disabled = running || !live;
      startAllButton.disabled = running;
      stopButton.disabled = !running;
      engineSelect.disabled = running;
      statusEl.textContent = running ? `录音中 · ${engine}` : '空闲';
    }

    async function loadEngines() {
      const response = await fetch('/engines');
      engineDescriptors = await response.json();
      engineSelect.innerHTML = '';
      for (const engine of engineDescriptors) {
        const option = document.createElement('option');
        option.value = engine.id;
        const live = engine.capabilities.includes('live_streaming');
        option.textContent = `${engine.priority} · ${engine.label}${live ? '' : ' · 待接入'}`;
        engineSelect.appendChild(option);
        modelState.set(engine.id, { descriptor: engine, result: {}, metrics: {}, status: engine.adapterStatus });
      }
      renderCards();
      renderEngineHint();
    }

    function renderCards() {
      cardsEl.innerHTML = '';
      for (const engine of engineDescriptors) {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.id = `card-${engine.id}`;
        card.innerHTML = `
          <div class="model-head">
            <div class="model-title">${engine.priority} · ${engine.label}</div>
            <div class="model-status" data-status>${engine.adapterStatus}</div>
          </div>
          <div class="model-output" data-output></div>
          <div class="model-metrics">
            <div class="metric"><span class="metric-label">首字延迟</span><span class="metric-value" data-first>暂无</span></div>
            <div class="metric"><span class="metric-label">更新间隔</span><span class="metric-value" data-interval>暂无</span></div>
            <div class="metric"><span class="metric-label">修订率</span><span class="metric-value" data-revision>0.0%</span></div>
            <div class="metric"><span class="metric-label">RTF</span><span class="metric-value" data-rtf>0.000</span></div>
          </div>
        `;
        cardsEl.appendChild(card);
      }
    }

    function updateCard(engineId) {
      const state = modelState.get(engineId);
      const card = document.getElementById(`card-${engineId}`);
      if (!state || !card) return;
      const result = state.result || {};
      const metrics = state.metrics || {};
      card.querySelector('[data-status]').textContent = state.status || '';
      card.querySelector('[data-output]').textContent = result.fullText || '';
      card.querySelector('[data-first]').textContent = ms(metrics.firstCharLatencyMs);
      card.querySelector('[data-interval]').textContent = ms(metrics.updateIntervalMs);
      card.querySelector('[data-revision]').textContent = pct(metrics.revisionRate || 0);
      card.querySelector('[data-rtf]').textContent = num(metrics.rtf || 0);
    }

    function ms(value) {
      return Number.isFinite(value) ? `${Math.round(value)} ms` : '暂无';
    }

    function pct(value) {
      return `${(value * 100).toFixed(1)}%`;
    }

    function num(value) {
      return Number(value || 0).toFixed(3);
    }

    function selectedDescriptor() {
      return engineDescriptors.find((engine) => engine.id === engineSelect.value);
    }

    function renderEngineHint() {
      const engine = selectedDescriptor();
      if (!engine) return;
      const live = engine.capabilities.includes('live_streaming');
      startButton.disabled = !live;
      statusEl.textContent = live ? engine.adapterStatus : `${engine.label}: ${engine.adapterStatus}`;
      log(`${engine.label}: ${engine.setupHint}`);
    }

    const events = new EventSource('/events');
    events.onopen = () => {
      if (statusEl.textContent === '服务已断开，请重新启动测试服务') {
        statusEl.textContent = '空闲';
      }
    };
    events.onerror = () => {
      statusEl.textContent = '服务已断开，请重新启动测试服务';
      startButton.disabled = true;
      startAllButton.disabled = true;
      stopButton.disabled = true;
    };
    events.addEventListener('partial', (event) => render(JSON.parse(event.data)));
    events.addEventListener('final', (event) => {
      const payload = JSON.parse(event.data);
      render(payload.final);
      log('最终结果：' + payload.final.fullText);
    });
    events.addEventListener('status', (event) => {
      const payload = JSON.parse(event.data);
      log(payload.message);
    });
    events.addEventListener('model-status', (event) => {
      const payload = JSON.parse(event.data);
      const state = modelState.get(payload.engine);
      if (state) {
        state.status = payload.ok ? payload.message : '错误：' + payload.message;
        updateCard(payload.engine);
      }
      log(`${payload.engine}: ${payload.message}`);
    });
    events.addEventListener('model-update', (event) => {
      const payload = JSON.parse(event.data);
      const state = modelState.get(payload.engine);
      if (state) {
        state.result = payload.result || {};
        state.metrics = payload.metrics || {};
        updateCard(payload.engine);
      }
    });
    events.addEventListener('state', (event) => {
      const payload = JSON.parse(event.data);
      setRunning(payload.running || payload.multiRunning, payload.engine || '');
      render(payload.result);
    });

    startButton.addEventListener('click', async () => {
      const engine = engineSelect.value;
      log('启动单模型：' + engine);
      try {
        const response = await fetch('/start?engine=' + encodeURIComponent(engine), { method: 'POST' });
        const payload = await response.json();
        if (!payload.ok) log('错误：' + payload.message);
      } catch (error) {
        log('服务连接失败：' + error.message);
        statusEl.textContent = '服务已断开，请重新启动测试服务';
      }
    });

    startAllButton.addEventListener('click', async () => {
      log('启动 3 个真实流式模型');
      for (const [engineId, state] of modelState.entries()) {
        state.result = {};
        state.metrics = {};
        state.status = state.descriptor.capabilities.includes('live_streaming') ? '启动中' : state.descriptor.adapterStatus;
        updateCard(engineId);
      }
      try {
        const response = await fetch('/start-all', { method: 'POST' });
        const payload = await response.json();
        if (!payload.ok) log('错误：' + payload.message);
      } catch (error) {
        log('服务连接失败：' + error.message);
        statusEl.textContent = '服务已断开，请重新启动测试服务';
      }
    });

    stopButton.addEventListener('click', async () => {
      log('停止录音');
      try {
        const response = await fetch('/stop', { method: 'POST' });
        const payload = await response.json();
        if (!payload.ok) log('错误：' + payload.message);
      } catch (error) {
        log('服务连接失败：' + error.message);
        statusEl.textContent = '服务已断开，请重新启动测试服务';
      }
    });

    engineSelect.addEventListener('change', renderEngineHint);

    loadEngines().catch((error) => log('加载模型列表失败：' + error.message));
  </script>
</body>
</html>
"""
