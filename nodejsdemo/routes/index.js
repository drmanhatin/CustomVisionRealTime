const router = require('express').Router()
const request = require('request')
var path = require('path')

let configs = {}

function create_UUID() {
    var dt = new Date().getTime()
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (dt + Math.random() * 16) % 16 | 0
        dt = Math.floor(dt / 16)
        return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
    return uuid
}

router.get('/', async (req, res) => {
    res.render('index')
})

//In this example I use Socket.io to pipe images from the browser to custom vision and then send the labels back to the browser
router.get('/setupSocketConnection', async (req, res) => {
    const uuid = create_UUID()
    const nsp = io2.of('/' + uuid)

    //Set appropriate headers
    let headers = {
        //Key can be found in CustomVision environment settings, e.g. https://www.customvision.ai/projects/5fc49522-####--####---####--3b60d11b6564#/settings
        'Prediction-key': global.gConfig.custom_vision_key,
        'Content-Type': 'application/octet-stream',
        url: global.gConfig.custom_vision_url,
    }

    //Url can also be found in CustomVision environment settings
    let opts = { url: global.gConfig.custom_vision_url, headers: headers, method: 'POST' }

    //In this example I use a socket connection to send images from the browser to this nodejs api.
    //Images are then piped to CustomVision
    nsp.on('connection', function (sock) {
        sock.on('config', function (config) {
            configs[sock.nsp.name] = config
        })

        sock.on('image', function (image, fn) {
            console.log('received image')
            fn('ack')

            opts['body'] = image

            request(opts, function cb(err, httpresp, body) {
                if (err) {
                    console.log(err)
                } else {
                    sock.emit('labels', body)
                }
            })
        })
    })

    res.send(uuid)
})


//get model for tensorflowjs
router.get('/getModel2', async (req, res) => {
  
    res.sendFile(req.params.fileName, { root: path.join(__dirname, '../data/model.json') })
})

router.get('/:fileName', async (req, res) => {
    res.sendFile(req.params.fileName, { root: path.join(__dirname, '../data') })
})

module.exports = router
