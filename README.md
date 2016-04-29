# SnoopALoop

*Integration Testing For API*

## Important To Know

- Two containers are created by default: `rethinkdb` and `hello-node-rethinkdb`
- `hello-node-rethinkdb` has a connection to the `rethinkdb` container
- A primus connection is used for connecting to build logs, CMD logs, and terminal
- Containers are deleted before the test is started
- Tests must be run **in order** and bail if any test fails

## Steps To Run

1. Push your branch to desired environment
2. Run `npm start`. If testing in another environment other than gamma, pass a arg flag with the env name (`npm start -- --beta`).

![screenshot.png](screenshot.png)

## Options

### CLI Opts

CLI options are passed as follows: `npm start -- --bool --num 1`

1. Environment: `--staging`, `--gamma`, `--beta`, `--epsilon`, `--delta`
2. Timeout: `--timeout NUMBER`
2. Github Auth Token: `--auth-token AUTH_TOKEN`

## ENV opts (CLI opts override these)

1. `API_URL`
2. `API_SOCKET_SERVER`
3. `AUTH_TOKEN`
4. `TIMEOUT`

## Philosophy And Constraints

- Tests should only involve actions that can be taken up by a normal user
- Tests should run quickly and should not take more than 2 minutes (currently 1 min)
- Tests should only use `api-client` and should not have any knowledge of the inner workings of API
- Tests should be able to run against any environment, including staging and prod

## Future Tests

Some of the things we could add in the future are:

- Isolation & Isolation DNS
- Auto-isolation
- DNS & Switching between branches
- Starting/Stopping/Restarting containers
- Switching commits. Pushing new commits to branch
