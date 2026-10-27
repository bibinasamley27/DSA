import asyncio
import json
from contextlib import asynccontextmanager, suppress
from time import monotonic
from anyio import CancelScope
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .engine import Engine
from .models import Reply

class Simulation:
    def __init__(self):
        self.engine = Engine()
        self.commands = asyncio.Queue()
        self.clients = set()

    def reply(self, kind, payload):
        return Reply(**self.engine.envelope(kind), payload=payload).model_dump(mode='json')

    def enqueue(self, outbox, message):
        if outbox.full():
            self.clients.discard(outbox)
            while not outbox.empty():
                outbox.get_nowait()
            outbox.put_nowait(None)
        else:
            outbox.put_nowait(message)

    def publish(self):
        state = self.engine.snapshot().model_dump(mode='json')
        for outbox in tuple(self.clients):
            self.enqueue(outbox, state)

    async def run(self):
        next_tick, next_broadcast = monotonic() + 1, monotonic() + .5
        while True:
            timeout = max(0, min(next_tick, next_broadcast) - monotonic())
            try:
                raw, outbox = await asyncio.wait_for(self.commands.get(), timeout)
                received = True
            except TimeoutError:
                received = False
            if received:
                pacing = (self.engine.sim_status, self.engine.speed, self.engine.run_id)
                try:
                    request_id = self.engine.command(raw)
                    reply = self.reply('ack', {'request_id': request_id})
                except (ValueError, TypeError):
                    request_id = raw.get('request_id') if isinstance(raw, dict) else None
                    reply = self.reply('error', {'request_id': request_id, 'message': 'Invalid command or lifecycle state'})
                self.enqueue(outbox, reply)
                self.publish()
                if pacing != (self.engine.sim_status, self.engine.speed, self.engine.run_id):
                    next_tick = monotonic() + 1 / self.engine.speed
            now = monotonic()
            if now >= next_tick:
                if self.engine.sim_status == 'running':
                    self.engine.advance()
                    trace = self.reply('decision_trace', {'decisions': [event.model_dump(mode='json') for event in self.engine.decisions]})
                    for outbox in tuple(self.clients):
                        self.enqueue(outbox, trace)
                next_tick = now + 1 / self.engine.speed
            if now >= next_broadcast:
                if self.engine.sim_status == 'running':
                    self.publish()
                next_broadcast = now + .5

@asynccontextmanager
async def lifespan(app):
    simulation = Simulation()
    app.state.simulation = simulation
    task = asyncio.create_task(simulation.run())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173'], allow_methods=['GET'])

@app.get('/health')
def health():
    return {'status': 'ok', 'protocol_version': '1.0'}

@app.websocket('/ws/v1/simulation')
async def socket(ws: WebSocket):
    origin = ws.headers.get('origin')
    if origin and origin != 'http://localhost:5173':
        await ws.close(code=1008)
        return
    await ws.accept()
    simulation = ws.app.state.simulation
    outbox = asyncio.Queue(maxsize=32)
    # Registration and initial snapshot contain no await, so no simulation tick interleaves.
    outbox.put_nowait(simulation.reply('welcome', {'shared_simulation': True}))
    outbox.put_nowait(simulation.engine.snapshot().model_dump(mode='json'))
    simulation.clients.add(outbox)

    async def sender():
        while True:
            message = await outbox.get()
            if message is None:
                await ws.close(code=1013)
                return
            await ws.send_json(message)

    async def receiver():
        while True:
            text = await ws.receive_text()
            try:
                raw = json.loads(text)
            except (ValueError, TypeError):
                raw = {}
            await simulation.commands.put((raw, outbox))

    tasks = [asyncio.create_task(sender()), asyncio.create_task(receiver())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            with suppress(WebSocketDisconnect, RuntimeError):
                task.result()
    except asyncio.CancelledError:
        pass  # Socket teardown can cancel the handler before receive observes the disconnect.
    finally:
        simulation.clients.discard(outbox)
        for task in tasks:
            task.cancel()
        with CancelScope(shield=True):
            await asyncio.gather(*tasks, return_exceptions=True)
