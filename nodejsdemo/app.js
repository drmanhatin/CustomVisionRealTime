var express = require('express')
const fileUpload = require('express-fileupload')
const path = require('path')
var exphbs = require('express-handlebars')
var io = require('socket.io')

var app = express()
app.use(express.json())

app.use(express.static(__dirname + 'public'))

require('./config/config.js')

app.use(express.static('public'))

var hbs = exphbs.create()

app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

var http = require('http').createServer(app)

//socket
global.io2 = io(http, { pingTimeout: 10000 })

const server = http.listen(global.gConfig.express_port, function () {
    console.log('listening on ' + global.gConfig.express_port)
})

module.exports = server

// server & routing
var index = require('./routes/index')
app.use('/', index)
