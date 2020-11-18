require('dotenv').config()

const crypto = require('crypto')
const dayjs = require('dayjs')
const express = require('express')
const rateLimit = require('express-rate-limit')

const app = express()
const lobbyNameLength = 1 * 2
const lobbyKeyLength = 4 * 4
const lobbyTimeout = [parseInt(process.env.LOBBY_TIMEOUT_SECONDS), 'second']
const port = process.env.HOST_PORT

const lobbyTimeoutInterval = dayjs().add(...lobbyTimeout).valueOf() - dayjs().valueOf()

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
    host: req.headers['x-forwarded-for'] || req.ip,
    key: crypto.randomBytes(lobbyKeyLength).toString('hex'),
    name: lobbyName,
    private: req.query.private === 'true'
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

const server = app.listen(port, () => {
  process.send('ready')

  console.log(`Lobby Server listening at http://localhost:${port}`)
})

const cleanupLobbiesInterval = setInterval(() => {
  const initialLobbyLength = lobbies.length

  lobbies = lobbies.filter(lobby => lobby.expires.isAfter(dayjs()))
  console.log(`Removed ${initialLobbyLength - lobbies.length}/${initialLobbyLength} lobbies. ${lobbies.length} lobbies currently active.`)
}, lobbyTimeoutInterval)

process.on('SIGINT', () => {
  clearInterval(cleanupLobbiesInterval)

  server.close(() => {
    console.log('Received SIGINT: Lobby Server shutting down...')
    process.exit(0)
  })
})
