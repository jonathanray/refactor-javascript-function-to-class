const path = require('path');

module.exports = {
	mode: 'production',
	entry: './src/convert.ts',
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: ['.ts', '.js'],
	},
	output: {
		filename: 'index.js',
		path: path.resolve(__dirname, 'dist'),
		library: 'converter',
		libraryTarget: 'umd',
		globalObject: 'this',
	}
};