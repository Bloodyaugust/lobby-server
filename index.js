require('dotenv').config()

const crypto = require('crypto')
const dayjs = require('dayjs')
const express = require('express')

const app = express()
const lobbyNameLength = 1 * 2
const lobbyTimeout = [10, 'second']
const port = process.env.HOST_PORT

let lobbies = []

function lobbyFactory (req) {
  let lobbyName = crypto.randomBytes(lobbyNameLength).toString('hex').toUpperCase()

  while (lobbies.find(lobby => lobby.name === lobbyName)) {
    lobbyName = crypto.randomBytes(lobbyNameLength).toString('hex').toUpperCase()
  }

  return {
    created: dayjs(),
    host: req.query.host,
    keepAlive: dayjs().add(...lobbyTimeout),
    name: lobbyName
  }
}

app.get('/', (req, res) => {
  res.json(lobbies.map(lobby => {
    return {
      alive: lobby.keepAlive.isAfter(dayjs()),
      host: lobby.host,
      name: lobby.name
    }
  }))
})

function log () {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...arguments)
  }
}

app.get('/keepalive', (req, res) => {
  const lobby = lobbies.find(lobby => lobby.name === req.query.name)

  if (lobby) {
    lobby.keepAlive = dayjs().add(...lobbyTimeout)
  }

  res.json(lobby || {})
})

app.get('/lobby/:name', (req, res) => {
  res.json(lobbies.find(lobby => lobby.name === req.params.name) || {})
})

app.get('/new', (req, res) => {
  const newLobby = lobbyFactory(req)

  lobbies.push(newLobby)

  res.json(newLobby)
})

app.listen(port, () => {
  log(`Example app listening at http://localhost:${port}`)
})

setInterval(() => {
  lobbies = lobbies.filter(lobby => lobby.keepAlive.isAfter(dayjs()))
  log(lobbies)
}, dayjs().add(...lobbyTimeout).valueOf() - dayjs().valueOf())
