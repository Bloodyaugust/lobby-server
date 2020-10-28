require('dotenv').config()

const crypto = require('crypto')
const dayjs = require('dayjs')
const express = require('express')

const app = express()
const lobbyNameLength = 1 * 2
const lobbyTimeout = [10, 'second']
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
    expires: dayjs().add(...lobbyTimeout),
    host: req.query.host,
    name: lobbyName
  }
}

app.get('/', (req, res) => {
  res.json(lobbies.map(lobby => {
    return formatLobby(lobby)
  }))
})

function log () {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...arguments)
  }
}

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

  newLobby.data = req.query.data

  lobbies.push(newLobby)

  res.json(formatLobby(newLobby))
})

app.listen(port, () => {
  log(`Example app listening at http://localhost:${port}`)
})

setInterval(() => {
  lobbies = lobbies.filter(lobby => lobby.expires.isAfter(dayjs()))
  log(lobbies)
}, lobbyTimeoutInterval)
