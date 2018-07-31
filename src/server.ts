import { INIT, OFFER_REQUEST, OFFER_ACCEPTED } from './constants'

// Payloads (importing from fast-rtc-peer into a server env is a headache)
const OFFER = 'offer'
const ANSWER = 'answer'
const CANDIDATE = 'candidate'

const sendAnswer = (ws, from, sdp) => {
  ws.send(JSON.stringify({
    type: ANSWER,
    from,
    sdp
  }))
}

const sendCandidate = (ws, from, candidate) => {
  if (!ws) return
  ws.send(JSON.stringify({
    type: CANDIDATE,
    from,
    candidate
  }))

}

const sendOffer = (ws, fromWS, offer) => {
  const { id, candidates, sdp } = offer
  const { _uuid: from } = fromWS
  fromWS.send(JSON.stringify({
    type: OFFER_ACCEPTED,
    id,
    from: ws._uuid
  }))
  fromWS._acceptedOffers[id] = ws._uuid
  ws.send(JSON.stringify({
    type: OFFER,
    from,
    sdp,
    candidates
  }))
}

const requestOffer = (ws) => {
  ws.send(JSON.stringify({
    type: OFFER_REQUEST
  }))
}

type WebSocketID = string

interface FastRTCWebSocket {
  OPEN: string
  readyState: string
  _uuid: WebSocketID
  _acceptedOffers: { [offerId: string]: WebSocketID }
  _offers: Array<CachedOffer>
  _requestors: Array<FastRTCWebSocket>
}

const getClientById = (clients, id) => {
  for (const client of clients) {
    if (client._uuid === id) return client
  }
  return null
}

class CachedOffer {
  id: string
  sdp: string
  candidates: Array<RTCIceCandidate>
  isComplete: boolean

  constructor(offerId, sdp) {
    this.id = offerId
    this.sdp = sdp
    this.candidates = []
    this.isComplete = false
  }
}

interface InitPayload {
  type: 'init'
  sdp: string
  offerId: string
  from: WebSocketID
}

interface OfferPayload {
  type: 'offer'
  sdp: string
  offerId
}

interface CandidatePayload {
  type: 'candidate'
  candidate: RTCIceCandidate
  to?: WebSocketID
  offerId?: string
}

interface AnswerPayload {
  type: 'answer'
  sdp: string
  to: WebSocketID

}

type IncomingPayload = InitPayload | OfferPayload | CandidatePayload | AnswerPayload

const handleOnMessage = (clients: Set<FastRTCWebSocket>, ws: FastRTCWebSocket, payload: IncomingPayload): boolean => {
  const { type } = payload
  if (type === INIT) {
    const { sdp, offerId, from } = payload as InitPayload
    ws._uuid = from
    ws._offers = [new CachedOffer(offerId, sdp)]
    ws._requestors = []
    ws._acceptedOffers = {}
    for (const existingPeer of clients) {
      if (existingPeer as any === ws || existingPeer.readyState !== ws.OPEN) continue
      const offer = existingPeer._offers.pop()
      if (!offer) {
        existingPeer._requestors.push(ws)
      } else {
        sendOffer(ws, existingPeer, offer)
      }
      requestOffer(existingPeer)
    }
    return true
  }
  if (type === OFFER) {
    const { sdp, offerId } = payload as OfferPayload
    const offer = new CachedOffer(offerId, sdp)
    const requestor = ws._requestors.pop()
    if (requestor) {
      sendOffer(requestor, ws._uuid, offer)
    } else {
      ws._offers.push(offer)
    }
    return true
  } else if (type === ANSWER) {
    const { sdp, to } = payload as AnswerPayload
    const client = getClientById(clients, to)
    if (client) {
      delete client._acceptedOffers[to]
      sendAnswer(client, ws._uuid, sdp)
    }
    return true
  }
  if (type === CANDIDATE) {
    const { candidate, offerId, to } = payload as CandidatePayload
    if (candidate) {
      if (offerId) {
        const offer = ws._offers.find(({ id }) => offerId === id)
        if (offer) {
          offer.candidates.push(candidate)
        } else {
          // the offer was already picked up by someone, find out who
          const to = ws._acceptedOffers[offerId]
          const client = getClientById(clients, to)
          sendCandidate(client, ws._uuid, candidate)
        }
      } else if (to) {
        // for re-negotiations
        const client = getClientById(clients, to)
        sendCandidate(client, ws._uuid, candidate)
      }
    }
    return true
  }
  return false
}

export default handleOnMessage