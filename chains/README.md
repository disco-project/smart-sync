
Contains a [openethereum](https://github.com/openethereum/openethereum) config for a private development chain.

## Chain Setup

The node's [config](config/config.toml) file specifies all allowed interfaces and api's the running node should provide. 
[keys](config/keys) contains a bunch of development accounts that are imported and unlocked during start up.
Run with [docker-compose.yml](docker-compose.yml):

```bash
docker-compose up -d
```
docker mounts the config folder and uses the json spec file and keys directory to initialize the chain and its accounts. Changes will persist in the `base_path` directory. Ports `8545` (RPC) and `8546` (WS) are exposed to the host at `127.0.0.1`.

To run with a local `openethereum` installation instead, (un)comment the relevant directory paths inside the [config.toml](config/config.toml) so that `openethereum` uses the correct spec and keys location. In order to access the persistent chain's data both from a chain started with `docker` and using `openethereum` directly, their versions must match.