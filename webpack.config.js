const path = require('path');

module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'worker.js',
        path: path.resolve(__dirname, 'dist'),
        library: {
            type: 'module'  // تغییر به module
        }
    },
    target: 'webworker',
    mode: 'production',
    resolve: {
        extensions: ['.js']
    },
    optimization: {
        minimize: false
    },
    experiments: {
        outputModule: true  // فعال کردن output module
    }
};