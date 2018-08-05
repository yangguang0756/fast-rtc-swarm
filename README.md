# fast-rtc-swarm

A full-mesh WebRTC swarm built on top of WebSockets & fast-rtc-peer

## Installation

`yarn add @mattkrick/fast-rtc-swarm`

## What is it

[fast-rtc-peer](https://github.com/mattkrick/fast-rtc-peer) offers a great API to connect 2 peers.
If you'd like to connect more than 2 peers, you're on your own.
That's why this exists.
It uses a full mesh (vs. partial mesh) network so every client is connected to every other client.
A full mesh is great for up to ~100 connections.
After that, you'll probably want to move to a partial mesh & trade a little latency for memory.

## How's it different from webrtc-swarm?

fast-rtc-swarm is different.
- It's built on fast-rtc-peer, which is built on the new WebRTC v1.0 spec.
- The signaling server doesn't have to be server sent events. It can be anything (reference implementation is WebSockets)
- It doesn't bother the signaling server with a heartbeat. We can derive that info from the swarm. 
If timeouts are an issue, then add a WebSocket#ping on your server. Don't make the client do more work than necessary!
- It only connects to 1 signaling server. Multiple servers is a proxy problem. Again, don't make the client work hard!
- No unauthenticated-by-default signaling server CLI. I'm not gonna make it easier for you to write an insecure server :-)
- No multiplexing streams. If you need a new data channel, open another one natively, not with expensive (and LARGE) stream packages.
- It uses the fast-rtc protocol for the fastest connection possible

## What makes it so fast?

The fast-rtc protocol completes a WebRTC handshake in only 2 round trips. 
Other implementations take 3 (or even 4!)
It does this by keeping a 1-length cache of offers and candidates.
Think of it like "pay-it-forward". 
You buy the person behind you a coffee, so they get a coffee when they get to register & buy the person behind them a coffee.
_To make connecting media even faster, use WebRTC v1.0 transceivers to open a stream before the handshake completes._

Here's how it works:

Alice is the first peer to join the swarm:
- She gives the server an OFFER that can be used by the next person to join
- As CANDIDATES trickle in, she forwards them to the server
- If the OFFER has been accepted, the server forwards the CANDIDATE to them, else it stores it with her OFFER
- When someone takes her OFFER, the server REQUESTS another from her

When Bob joins the swarm:
- He follows the same procedure as Alice
- He takes all the unclaimed OFFERS and CANDIDATES on the server
- If Alice does not have an OFFER readily available, Bob puts his name on her waiting list
- On the client, Bob creates an ANSWER to each OFFER and forwards it to the signaling server
- The signaling server forwards Bob's ANSWER to Alice
- Alice uses Bob's ANSWER to initiate the connection

That's it! See `server.js` for a reference implementation and the example below to see how to add it to your own server.

## Usage

```js
// client
import FastRTCSwarm from '@mattkrick/fast-rtc-swarm'

const socket = new WebSocket('ws://localhost:3000');
socket.addEventListener('open', () => {
  const swarm = new FastRTCSwarm()
  // send the signal to the signaling server
  swarm.on('signal', (signal) => {
    socket.send(JSON.stringify(signal))
  })
  // when the signal come back, dispatch it to the swarm
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    swarm.dispatch(payload)
  })
  // when the connection is open, say hi to your new peer
  swarm.on('dataOpen', (peer) => {
    console.log('data channel open!')
    peer.send('hi')
  })
  // when your peer says hi, log it
  swarm.on('data', (data, peer) => {
    console.log('data received', data, peer)
  })
})


// server
import handleOnMessage from '@mattkrick/fast-rtc-swarm/server'

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const payload = JSON.parse(message)
    // Check your perms here!
    if (handleOnMessage(wss.clients, ws, payload)) return
    // your other websocket handlers here
  })
})
```

## API

Options: A superset of `RTCConfiguration`. 
To add a TURN server to the default list of ICE candidates, see [fast-rtc-peer](https://github.com/mattkrick/fast-rtc-peer). 
- `id`: An ID to assign to the peer, defaults to a v4 uuid
- `wrtc`: pass in [node-webrtc](https://github.com/js-platform/node-webrtc) if using server side

Methods on FastRTCSwarm
- `dispatch(signal)`: receive an incoming signal from the signal server
- `broadcast(message)`: send a string or buffer to all connected peers
- `close()`: destroy all peer connections

## Events

- `swarm.on('dataOpen', (peer) => {})`: fired when a peer connects
- `swarm.on('dataClose', (peer) => {})`: fired when a peer disconnects
- `swarm.on('data', (data, peer) => {})`: fired when a peer sends data
- `swarm.on('signal', (signal, peer) => {})`: fired when a peer creates an offer, ICE candidate, or answer. 

## License

MIT
