require('dotenv').config()

const crypto = require('crypto')
const dgram = require('dgram')
const dayjs = require('dayjs')
const express = require('express')
const rateLimit = require('express-rate-limit')

const app = express()
const discoverServer = dgram.createSocket('udp4')
const lobbyServer = dgram.createSocket('udp4')
const lobbyNameLength = 1 * 2
const lobbyKeyLength = 4 * 4
const lobbyTimeout = [parseInt(process.env.LOBBY_TIMEOUT_SECONDS), 'second']
const peerIDLength = 4 * 4
const peerTimeout = [parseInt(process.env.PEER_TIMEOUT_SECONDS), 'second']
const port = process.env.HOST_PORT

const lobbyTimeoutInterval = dayjs().add(...lobbyTimeout).valueOf() - dayjs().valueOf()
const peerTimeoutInterval = dayjs().add(...peerTimeout).valueOf() - dayjs().valueOf()

let exitCode = 0

const getLobbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV !== 'production' ? 9999 : 20
})
const keepAliveLimiter = rateLimit({
  windowMs: lobbyTimeoutInterval,
  max: process.env.NODE_ENV !== 'production' ? 9999 : 4
})
const newLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV !== 'production' ? 9999 : 2
})
const rootLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV !== 'production' ? 9999 : 4
})

let udpPeers = []
let lobbies = []

function formatLobby (lobby, preserveKey) {
  if (lobby) {
    return {
      ...lobby,
      created: lobby.created.valueOf(),
      expires: lobby.expires.valueOf(),
      key: preserveKey ? lobby.key : undefined,
      keepAlive: lobbyTimeoutInterval
    }
  }

  return false
}

function lobbyFactory (req) {
  let lobbyName = crypto.randomBytes(lobbyNameLength).toString('hex').toUpperCase()

  while (lobbies.find(lobby => lobby.name === lobbyName)) {
    lobbyName = crypto.randomBytes(lobbyNameLength).toString('hex').toUpperCase()
  }

  return {
    created: dayjs(),
    data: req.query.data || {},
    expires: dayjs().add(...lobbyTimeout),
    host: req.query.host,
    key: crypto.randomBytes(lobbyKeyLength).toString('hex'),
    name: lobbyName,
    private: req.query.private === 'true'
  }
}

function udpPeerFactory (peerData) {
  const now = dayjs()

  let peerID = crypto.randomBytes(peerIDLength).toString('hex').toUpperCase()

  while (udpPeers.find(peer => peer.id === peerID)) {
    peerID = crypto.randomBytes(peerIDLength).toString('hex').toUpperCase()
  }

  return {
    address: peerData.address,
    created: now,
    expires: now.add(...peerTimeout),
    host: null,
    id: peerID,
    lobby: null,
    lobbyAddress: null,
    lobbyPort: null,
    port: peerData.port
  }
}

app.get('/', rootLimiter, (req, res) => {
  res.json(lobbies.filter(lobby => !lobby.private).map(lobby => formatLobby(lobby)))
})

app.get('/lobby/:name', getLobbyLimiter, (req, res) => {
  res.json(formatLobby(lobbies.find(lobby => lobby.name === req.params.name)) || {})
})

app.get('/lobby/:name/keepalive', keepAliveLimiter, (req, res) => {
  const lobby = lobbies.find(lobby => lobby.name === req.params.name)

  if (lobby) {
    lobby.expires = dayjs().add(...lobbyTimeout)
  }

  res.json(formatLobby(lobby) || {})
})

app.get('/new', newLimiter, (req, res) => {
  const newLobby = lobbyFactory(req)

  lobbies.push(newLobby)

  res.json(formatLobby(newLobby, true))
})

app.post('/lobby/:name', (req, res) => {
  if (!req.query.key) {
    throw new Error('No key provided')
  }

  const lobby = lobbies.find(lobby => lobby.name === req.params.name)

  if (!lobby) {
    throw new Error('Lobby not found')
  }

  if (lobby.key !== req.query.key) {
    throw new Error('Lobby key incorrect')
  }

  Object.assign(lobby, {
    data: req.query.data || lobby.data,
    private: req.query.private ? req.query.private === 'true' : lobby.private
  })

  res.json(formatLobby(lobby))
})

discoverServer.on('error', (err) => {
  console.log(`Discover Server error: ${err}`)
  exitCode = 1
  process.kill(process.pid, 'SIGINT')
})
lobbyServer.on('error', (err) => {
  console.log(`Lobby Server error: ${err}`)
  exitCode = 1
  process.kill(process.pid, 'SIGINT')
})

discoverServer.on('message', (msg, rinfo) => {
  const jsonMessage = JSON.parse(decodeURIComponent(escape(msg)))
  let newPeer

  console.log(`DISCOVER message received: ${JSON.stringify(jsonMessage)} with rinfo: ${JSON.stringify(rinfo)}`)

  switch (jsonMessage.type) {
    case 'DISCOVER':
      newPeer = udpPeerFactory({
        ...rinfo
      })

      discoverServer.send(unescape(encodeURIComponent(JSON.stringify({
        type: 'ACK_DISCOVER',
        peer: newPeer
      }))), newPeer.port, newPeer.address)

      udpPeers.push(newPeer)
      break

    default:
      break
  }
})
lobbyServer.on('message', (msg, rinfo) => {
  const jsonMessage = JSON.parse(decodeURIComponent(escape(msg)))
  const gamePeers = udpPeers.filter(peer => peer.lobby === jsonMessage.lobby)
  let currentPeer, updatingPeer

  console.log(`LOBBY message received: ${JSON.stringify(jsonMessage)} with rinfo: ${JSON.stringify(rinfo)}`)

  switch (jsonMessage.type) {
    case 'JOIN':
      updatingPeer = udpPeers.find(peer => peer.id === jsonMessage.peerID)

      updatingPeer.lobbyAddress = rinfo.address
      updatingPeer.lobbyPort = rinfo.port

      lobbyServer.send(unescape(encodeURIComponent(JSON.stringify({
        type: 'ACK_JOIN',
        peer: updatingPeer
      }))), updatingPeer.lobbyPort, updatingPeer.lobbyAddress)
      console.log('sent ack join')

      gamePeers.forEach((peer) => {
        lobbyServer.send(unescape(encodeURIComponent(JSON.stringify({
          type: 'JOIN',
          peer: updatingPeer
        }))), peer.lobbyPort, peer.lobbyAddress)

        lobbyServer.send(unescape(encodeURIComponent(JSON.stringify({
          type: 'JOIN',
          peer: peer
        }))), updatingPeer.lobbyPort, updatingPeer.lobbyAddress)
      })
      break

    case 'START':
      gamePeers.forEach((peer) => {
        lobbyServer.send(unescape(encodeURIComponent(JSON.stringify({
          type: 'START'
        }))), peer.lobbyPort, peer.lobbyAddress)
      })
      break

    case 'KEEPALIVE':
      currentPeer = udpPeers.find(peer => peer.id === jsonMessage.peerID)

      currentPeer.expires = dayjs().add(...peerTimeout)

      lobbyServer.send(unescape(encodeURIComponent(JSON.stringify({
        type: 'ACK'
      }))), currentPeer.lobbyPort, currentPeer.lobbyAddress)
      break

    case 'LEAVE':
      currentPeer = udpPeers.splice(udpPeers.findIndex(peer => peer.id === jsonMessage.peerID), 1)

      lobbyServer.send(unescape(encodeURIComponent(JSON.stringify({
        type: 'ACK'
      }))), currentPeer.lobbyPort, currentPeer.lobbyAddress)
      break

    default:
      break
  }
})

discoverServer.on('listening', () => {
  console.log(`DISCOVER server listening: ${JSON.stringify(discoverServer.address())}`)
})
lobbyServer.on('listening', () => {
  console.log(`LOBBY server listening: ${JSON.stringify(lobbyServer.address())}`)
})

discoverServer.bind(process.env.DISCOVER_HOST_PORT)
lobbyServer.bind(process.env.LOBBY_HOST_PORT)

const server = app.listen(port, () => {
  process.send('ready')

  console.log(`Lobby Server listening at http://localhost:${port}`)
})

const cleanupLobbiesInterval = setInterval(() => {
  const initialLobbyLength = lobbies.length

  lobbies = lobbies.filter(lobby => lobby.expires.isAfter(dayjs()))
  console.log(`Removed ${initialLobbyLength - lobbies.length}/${initialLobbyLength} lobbies. ${lobbies.length} lobbies currently active.`)
}, lobbyTimeoutInterval)

const cleanupPeersInterval = setInterval(() => {
  const initialUDPPeersLength = udpPeers.length

  udpPeers = udpPeers.filter(peer => peer.expires.isAfter(dayjs()))
  console.log(`Removed ${initialUDPPeersLength - udpPeers.length}/${initialUDPPeersLength} udpPeers. ${udpPeers.length} udpPeers currently active.`)
}, peerTimeoutInterval)

process.on('SIGINT', () => {
  clearInterval(cleanupLobbiesInterval)
  clearInterval(cleanupPeersInterval)

  discoverServer.close()
  lobbyServer.close()

  server.close(() => {
    console.log('Received SIGINT: Lobby Server shutting down...')
    process.exit(exitCode)
  })
})
