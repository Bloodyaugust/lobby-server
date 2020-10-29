require('dotenv').config()

const crypto = require('crypto')
const dayjs = require('dayjs')
const express = require('express')
const rateLimit = require('express-rate-limit')

const app = express()
const lobbyNameLength = 1 * 2
const lobbyTimeout = [parseInt(process.env.LOBBY_TIMEOUT_SECONDS), 'second']
const port = process.env.HOST_PORT

const lobbyTimeoutInterval = dayjs().add(...lobbyTimeout).valueOf() - dayjs().valueOf()

const getLobbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
})
const keepAliveLimiter = rateLimit({
  windowMs: lobbyTimeoutInterval,
  max: 4
})
const newLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2
})
const rootLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 4
})


let lobbies = []

function formatLobby (lobby) {
  if (lobby) {
    return {
      ...lobby,
      created: lobby.created.valueOf(),
      expires: lobby.expires.valueOf(),
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

  res.json(formatLobby(newLobby))
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
