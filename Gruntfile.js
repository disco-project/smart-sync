const child_process = require('child_process');
const CHAIN_DOCKER_NAME = 'crossChainContracts_test_chain';
const CONFIG_CHAIN_DIR = './chain/';
const CHAIN_DIR = './chain/';
const NETWORK = 'disco';

module.exports = (grunt) => {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        eslint: {
            target: ['src/**/*.ts', 'test/**/*.ts', 'evaluation/**/*.ts'],
            options: {
                maxWarnings: 5,
                fix: true,
            },
        },
        watch: {
            files: ['<%= eslint.files %>'],
            tasks: ['eslint'],
        },
    });
    grunt.loadNpmTasks('grunt-eslint');

    grunt.registerTask('test', 'Run tests', () => {
        child_process.execSync(`NODE_OPTIONS=--max_old_space_size=4096 npx hardhat test --network ${NETWORK} test/*.ts`, { stdio: 'inherit' });
    });

    grunt.registerTask('start-chain', 'Startup chain', () => {
        let container;
        try {
            container = child_process.execSync(`docker ps || grep ${CHAIN_DOCKER_NAME}`);
        } catch(e) {
            grunt.fail.fatal(e);
        }
        if (container) {
            grunt.verbose.write('Stopping containers...');
            child_process.execSync(`docker stop ${CHAIN_DOCKER_NAME}`);
            child_process.execSync(`docker rm -f ${CHAIN_DOCKER_NAME}`);
            grunt.verbose.ok();
        }
        grunt.verbose.write('Removing chain data from test chains...');
        child_process.execSync(`rm -rf ${CONFIG_CHAIN_DIR}chain-data`);
        grunt.verbose.ok();
        grunt.verbose.write('Starting test chains...');
        child_process.execSync('docker-compose up -d', { cwd: CHAIN_DIR });
    });

    grunt.registerTask('stop-chain', 'Stopping chain', () => {
        grunt.verbose.write('Stopping test chain containers...');
        child_process.execSync(`docker stop ${CHAIN_DOCKER_NAME}`);
        grunt.verbose.ok();
    });

    grunt.registerTask('compile-contracts', 'Generate contract type info', () => {
        child_process.execSync('npx hardhat compile', { stdio: 'inherit' });
    });

    grunt.registerTask('evaluate', 'Run evaluation', () => {
        child_process.execSync(`NODE_OPTIONS=--max_old_space_size=4096 npx hardhat --network ${NETWORK} test evaluation/*.ts`, { stdio: 'inherit' });
    });

    grunt.registerTask('full-pipeline', 'testing', () => {
        grunt.task.run('compile-contracts');
        grunt.task.run('eslint');
        grunt.task.run('start-chain');
        grunt.task.run('test');
        grunt.task.run('stop-chain');
    });

    grunt.registerTask('full-pipeline-evaluation', 'testing', () => {
        grunt.task.run('compile-contracts');
        grunt.task.run('eslint');
        grunt.task.run('start-chain');
        grunt.task.run('evaluate');
        grunt.task.run('stop-chain');
    });

    grunt.registerTask('default', ['eslint']);

    grunt.registerTask('install', 'Install cross-chain-cli', () => {
        child_process.execSync(`npm i`, { stdio: 'inherit' });
        child_process.execSync(`npx hardhat compile`, { stdio: 'inherit' });
        child_process.execSync(`npm i -g`, { stdio: 'inherit' });
        grunt.verbose.ok();
    });
};
