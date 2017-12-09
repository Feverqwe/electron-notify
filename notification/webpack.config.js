const {DefinePlugin} = require('webpack');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin');

module.exports = {
  entry: {
    notification: './src/index.js'
  },
  output: {
    filename: 'dist/[name].js'
  },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['env', {
                "targets": {
                  "browsers": ["Chrome >= 58"]
                }
              }]
            ]
          }
        }
      },
      {
        test: /\.css/,
        use: [{
          loader: "style-loader"
        }, {
          loader: "css-loader"
        }, {
          loader: "clean-css-loader"
        }]
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin('dist'),
    new UglifyJSPlugin(),
    new DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new HtmlWebpackPlugin({
      filename: 'notification.html',
      template: 'src/index.html',
      inlineSource: /\.js$/
    }),
    new HtmlWebpackInlineSourcePlugin()
  ]
};