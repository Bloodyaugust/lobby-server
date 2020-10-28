# Lobby Server

Intended for use as a lightweight lobby for games, using the 4 character lobby ID pattern, and a configurable timeout with a lobby cleaning function.

#### -WARNING!-

This server is currently the opposite of secure, and should not be considered production ready.


## Developing

`yarn install && yarn start`

## Dockerfile

To build:
`docker build .circleci/images/lobby-server/ -t greysonr/lobby_server:<version number>`

To push:
`docker push greysonr/lobby_server:<tag name>`
