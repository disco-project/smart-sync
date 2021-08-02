#!/bin/bash
test_dir_path=`pwd`
config_chain_directory="./../config/"
chain_directory="./../"
chain_docker_name="crossChainContracts_test_chain"
network="disco"

# stopping docker containers if they are running
CONTAINERS=`docker ps | grep ${chain_docker_name}`
if [[ -n ${CONTAINERS} ]]; then
    echo "Stopping chain container..."
    docker stop ${chain_docker_name}
    echo "Done."
fi

# remove chain data
echo "Removing chain data from test chains..."
rm -rf ${config_chain_directory}chain-data
echo "Done."

# start chains
echo "Starting test chains..."
cd ${chain_directory}
docker-compose up -d
cd ${test_dir_path}
echo "Done."

# exec tests
echo "Exec tests..."
NODE_OPTIONS=--max_old_space_size=4096 ./node_modules/hardhat/internal/cli/cli.js --network ${network} test evaluation/*.ts
echo "Done."

# stop chains
echo "Stopping test chain containers..."
docker stop ${chain_docker_name}
echo "Done."