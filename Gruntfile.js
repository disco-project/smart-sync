const child_process = require('child_process');
const CHAIN_DOCKER_NAME = 'crossChainContracts_test_chain';
const CONFIG_CHAIN_DIR = 'chain1-data';
const CHAIN_DIR = './chains';
const CHAIN_DOCKER_NAME_2 = 'crossChainContracts_test_chain_2';
const CONFIG_CHAIN_DIR_2 = 'chain2-data';

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
        clean: ['dist/'],
        // Configure a mochaTest task
        mochaTest: {
          test: {
            options: {
              reporter: 'spec',
              quiet: false, // Optionally suppress output to standard out (defaults to false)
              clearRequireCache: false, // Optionally clear the require cache before running tests (defaults to false)
              clearCacheFilter: (key) => true, // Optionally defines which files should keep in cache
              noFail: false, // Optionally set to not fail on failed tests (will still fail on other errors)
              timeout: 36000000
            },
            src: ['dist/test/**/*.js']
          }
        },
        watch: {
            files: ['<%= eslint.files %>'],
            tasks: ['eslint'],
        },
    });
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-contrib-clean');

    grunt.registerTask('default', ['eslint']);

    grunt.registerTask('start-chains', 'Startup chain', () => {
        grunt.verbose.write('Starting test chains...');
        child_process.execSync('docker-compose up -d', { cwd: CHAIN_DIR });
    });

    grunt.registerTask('stop-chains', 'Stopping chain', () => {
        let container;
        let container2;
        try {
            const re = new RegExp(`${CHAIN_DOCKER_NAME}`, 'g');
            const re2 = new RegExp(`${CHAIN_DOCKER_NAME_2}`, 'g');
            container = re.exec(child_process.execSync('docker ps').toString());
            container2 = re2.exec(child_process.execSync('docker ps').toString());
        } catch(e) {
            grunt.fail.fatal(e);
        }
        if (container || container2) {
            grunt.verbose.write(`Stopping containers...`);
            child_process.execSync(`docker-compose stop`, { cwd: CHAIN_DIR });
            child_process.execSync(`docker-compose rm -f`, { cwd: CHAIN_DIR });
            grunt.verbose.ok();
        }
        grunt.verbose.write('Removing chain data from test chains...');
        child_process.execSync(`rm -rf ${CHAIN_DIR}/${CONFIG_CHAIN_DIR}`);
        child_process.execSync(`rm -rf ${CHAIN_DIR}/${CONFIG_CHAIN_DIR_2}`);
        grunt.verbose.ok();
    });
    
    grunt.registerTask('compile-project', 'Generate js-files', () => {
        grunt.task.run('clean');
        grunt.task.run('compile-contracts');
        grunt.task.run('eslint');
        grunt.task.run('tsc');
    });

    grunt.registerTask('compile-contracts', 'Generate contract type info', () => {
        child_process.execSync('npx hardhat compile', { stdio: 'inherit' });
    });

    grunt.registerTask('tsc', 'Compile ts files', () => {
        if (!grunt.file.exists('./artifacts/contracts/ProxyContract.sol/ProxyContract.json')) {
            grunt.log.writeln('Contracts were not compiled yet.');
            grunt.task.run('compile-contracts');
        }
        child_process.execSync('tsc', { stdio: 'inherit' });
        grunt.file.copy('./artifacts/contracts/ProxyContract.sol/ProxyContract.json', './dist/artifacts/contracts/ProxyContract.sol/ProxyContract.json');
    });

    grunt.registerTask('install', 'Install cross-chain-cli', () => {
        child_process.execSync(`npm i --development`, { stdio: 'inherit' });
        grunt.task.run('compile-project');
        grunt.task.run('install-global');
        grunt.verbose.ok();
    });

    grunt.registerTask('install-global', 'Install cross-chain-cli globally', () => {
        child_process.execSync(`npm i -g`, { stdio: 'inherit' });
    });

    grunt.registerTask('pack', 'npm pack cross-chain-cli', () => {
        grunt.task.run('install'); 
        grunt.task.run('npm-pack');
    });

    grunt.registerTask('npm-pack', 'npm packaging command', () => {
        child_process.execSync(`npm pack`, { stdio: 'inherit' });
    })

    grunt.registerTask('full-pipeline-test', 'Testing precompiled *.ts project', () => {
        grunt.task.run('compile-contracts');
        grunt.task.run('eslint');
        grunt.task.run('stop-chains');
        grunt.task.run('start-chains');
        grunt.task.run('test');
        grunt.task.run('stop-chains');
    });

    grunt.registerTask('full-pipeline-dist-test', 'Testing compiled *.js project inside dist folder', () => {
        if (!grunt.file.exists('dist')) {
            grunt.log.writeln('Dir dist does not exist. Will compile the project now.');
            grunt.task.run('compile-project');
        }
        grunt.task.run('eslint');
        grunt.task.run('stop-chains');
        grunt.task.run('start-chains');
        grunt.task.run('mochaTest');
        grunt.task.run('stop-chains');
    });

    grunt.registerTask('full-pipeline-evaluation', 'Evaluating project', () => {
        grunt.task.run('compile-contracts');
        grunt.task.run('eslint');
        grunt.task.run('stop-chains');
        grunt.task.run('start-chains');
        grunt.task.run('evaluate');
        grunt.task.run('stop-chains');
    });

    grunt.registerTask('evaluate', 'Run evaluation', () => {
        child_process.execSync(`NODE_OPTIONS=--max_old_space_size=4096 npx hardhat test ./evaluation/*.ts`, { stdio: 'inherit' });
    });

    grunt.registerTask('test', 'Run tests', () => {
        child_process.execSync(`NODE_OPTIONS=--max_old_space_size=4096 npx hardhat test ./test/*.ts`, { stdio: 'inherit' });
    });
};
