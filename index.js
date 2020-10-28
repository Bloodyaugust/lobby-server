require('dotenv').config()

const crypto = require('crypto')
const dayjs = require('dayjs')
const express = require('express')

const app = express()
const lobbyNameLength = 1 * 2
const lobbyTimeout = [parseInt(process.env.LOBBY_TIMEOUT_SECONDS), 'second']
const port = process.env.HOST_PORT

const lobbyTimeoutInterval = dayjs().add(...lobbyTimeout).valueOf() - dayjs().valueOf()

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

app.get('/', (req, res) => {
  res.json(lobbies.filter(lobby => !lobby.private).map(lobby => formatLobby(lobby)))
})

app.get('/lobby/:name', (req, res) => {
  res.json(formatLobby(lobbies.find(lobby => lobby.name === req.params.name)) || {})
})

app.get('/lobby/:name/keepalive', (req, res) => {
  const lobby = lobbies.find(lobby => lobby.name === req.params.name)

  if (lobby) {
    lobby.expires = dayjs().add(...lobbyTimeout)
  }

  res.json(formatLobby(lobby) || {})
})

app.get('/new', (req, res) => {
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
