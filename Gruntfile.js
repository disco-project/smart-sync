const child_process = require('child_process');

module.exports = (grunt) => {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        eslint: {
            target: ['src/**/*.ts', 'test/**/*.ts'],
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
        child_process.execSync('npm run test', { stdio: 'inherit' });
    });

    grunt.registerTask('default', 'testing', () => {
        grunt.task.run('eslint');
        grunt.task.run('test');
    });
};
