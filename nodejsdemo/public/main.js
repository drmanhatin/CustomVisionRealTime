var constraints
var imageCapture
var mediaStream

var img = document.querySelector('img')
var video = document.querySelector('video')
var videoSelect = document.querySelector('select#videoSource')

var canvas = document.getElementById('cv2')
var ctx = canvas.getContext('2d')

let resizeFactor = 1
let compressionRatio = 0.9

//bunch of logging variables, used for developing/profiling
let startGrabFrameTime = null
let endGrabFrameTime = null
let startDrawImageTime = null
let startSendAzureTime = null
let startSendTime = null
let endSendTime = null

let ratio = 2
let reqsSincePause = 0
let logging = false
let pauseAutomatically = true
let analyzeLocally = false
var itemtitles = []
videoSelect.onchange = getStream

navigator.mediaDevices
    .enumerateDevices()
    .then(gotDevices)
    .catch((error) => {
        console.log('enumerateDevices() error: ', error)
    })
    .then(getStream)

function gotDevices(deviceInfos) {
    for (var i = 0; i !== deviceInfos.length; ++i) {
        var deviceInfo = deviceInfos[i]
        var option = document.createElement('option')
        option.value = deviceInfo.deviceId
        if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || 'Camera ' + (videoSelect.length + 1)
            videoSelect.appendChild(option)
        }
    }
}

function getStream() {
    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => {
            track.stop()
        })
    }
    var videoSource = videoSelect.value
    constraints = {
        video: {
            deviceId: videoSource ? { exact: videoSource } : undefined,
            width: { min: 1000, ideal: 30000 },
            height: { min: 1000, ideal: 30000 },
        },
    }
    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(gotStream)
        .catch((error) => {
            console.log('getUserMedia error: ', error)
        })
}
function gotStream(stream) {
    mediaStream = stream
    video.srcObject = stream
    video.classList.remove('hidden')
    imageCapture = new ImageCapture(stream.getVideoTracks()[0])
    getCapabilities()

    video.addEventListener('playing', function () {
        let cv1 = document.getElementById('cv1')
        cv1.width = video.offsetWidth
        cv1.height = video.offsetHeight
        ratio = video.videoWidth / video.offsetWidth
    })
}

let frozen = false

function onFreezeChange(e) {
    if (e.checked == true) {
        freezeFrame()
    } else {
        unFreezeFrame()
        reqsSincePause = 0
    }
}

function onPauseAutomaticallyChange(e) {
    if (e.checked == true) {
        pauseAutomatically = true
    } else {
        pauseAutomatically = false
    }
}

function freezeFrame() {
    let cv = document.getElementById('cv2')

    let vd = document.getElementById('video')
    cv.style = 'position: absolute; display: block; width: ' + vd.offsetWidth + 'px !important;'

    frozen = true
}

function unFreezeFrame() {
    let cv = document.getElementById('cv2')
    cv.style = 'display: none'

    frozen = false
}

function onAnalysisChange(e) {
    analyzeLocally = e.checked
}

function changeSize(e) {
    resizeFactor = parseInt(e)

    document.getElementById('sizeLabel').innerHTML = 'Reduce size by ' + e + ' times '
}

function changeCompression(e) {
    compressionRatio = parseFloat(e)
    document.getElementById('compressLabel').innerHTML = 'Compress factor: ' + e
}

// Get the PhotoCapabilities for the currently selected camera source.
function getCapabilities() {
    imageCapture
        .getPhotoCapabilities()
        .then(function (capabilities) {
   
        })
        .catch(function (error) {
            console.log('getCapabilities() error: ', error)
        })
}

async function loop() {

    try {
        //if processing online and auto pause is enabled, pause after 10 reqs
        if (reqsSincePause > 250 && !frozen && pauseAutomatically & !analyzeLocally) {
            document.getElementById('pausebutton').click()

            setTimeout(function () {
                loop()
            }, 111)
        } else if (totalReqs > 10 && !analyzeLocally) {
            //prevent too many concurrent requests
            setTimeout(function () {
                loop()
            }, 111)
            return
        } else if (frozen) {
            setTimeout(function () {
                loop()
            }, 1111)
            return
        } else if (analyzeLocally) {
            await processLocally()
        } else {
            await processOnAzure()
        }
    } catch (e) {
        console.log(e)
        setTimeout(function () {
            loop()
        }, 111)
    }
}

async function processLocally() {
    imageCapture.grabFrame().then(async function (imageBitmap) {
        canvas.width = imageBitmap.width / resizeFactor
        canvas.height = imageBitmap.height / resizeFactor

        ctx.drawImage(imageBitmap, 0, 0, imageBitmap.width / resizeFactor, imageBitmap.height / resizeFactor)

        let labels = await scoreImageLocally(canvas)

        drawLocalLabels(labels)
        totalReqs += 1
        loop()
    })
}

async function processOnAzure() {
    startGrabFrameTime = Date.now()

    imageCapture
        .grabFrame()
        .then(async function (imageBitmap) {
            endGrabFrameTime = Date.now()

            if (logging) console.log(endGrabFrameTime - startGrabFrameTime, ' time required to grabframe()')

            canvas.width = imageBitmap.width / resizeFactor
            canvas.height = imageBitmap.height / resizeFactor

            ctx.drawImage(imageBitmap, 0, 0, imageBitmap.width / resizeFactor, imageBitmap.height / resizeFactor)

            startDrawImageTime = Date.now()

            ctx.canvas.toBlob(
                (blob) => {
                    startSendAzureTime = Date.now()

                    if (logging) console.log(startSendAzureTime - startDrawImageTime, ' total time required to make image into blob + compress')

                    loop()
                    sendImageToAzure(blob)
                },
                'image/jpeg',
                compressionRatio
            )
        })
        .catch(function (error) {})
}

let detectedSKUScorestable = document.getElementById('skutable')

let model = undefined

//tensorflowJS needs to load the model before you can use it
//best to do this before displaying the page because it consumes a lot of cpu + mem + gpu
async function makeDummy() {
    model = await tf.loadGraphModel('/model.json', null)
    const dummy = tf.zeros([1, 320, 320, 3], 'float32')

    model.executeAsync(dummy).then(function (result) {
        document.getElementById('loader').style = 'display: none;'
        dummy.dispose()
    })
}

async function loadLabelsClasses() {
    const resp = await axios.get('/labels.txt')
    itemtitles = resp.data.split('\n')
}

async function scoreImageLocally() {
    let t4d = tf.tidy(() => {
        const image = tf.browser.fromPixels(canvas).resizeBilinear([320, 320])
        return tf.tensor4d(image.dataSync(), [1, 320, 320, 3])
    })

    let outputs = await model.executeAsync(t4d)

    let arrays = !Array.isArray(outputs) ? outputs.array() : Promise.all(outputs.map((t) => t.array()))

    let labels = []

    arrays = await arrays

    for (let i = 0; i < arrays[0].length; i++) {
        let label = {
            tagName: arrays[0][i],
            probability: arrays[1][i],
            boundingBox: arrays[2][i],
        }
        labels.push(label)
    }

    t4d.dispose()

    outputs.forEach((element) => {
        element.dispose()
        tf.dispose(element)
    })

    tf.disposeVariables()
    return labels
}

function drawLocalLabels(items) {
    var c = document.getElementById('cv1')
    var ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.font = '12px Segoe UI'
    ctx.fillStyle = '#FFBB00'
    ctx.strokeStyle = '#FFBB00'
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 1
    ctx.lineWidth = 3

    let detectedSKUScores = {}


    //loop through all items/skus
    for (let i = 0; i < items.length; i++) {
        
        //find the highest matching scores per sku
        if (detectedSKUScores[itemtitles[items[i]['tagName']]] == undefined) {
            detectedSKUScores[itemtitles[items[i]['tagName']]] = items[i]['probability']
        } else if (detectedSKUScores[itemtitles[items[i]['tagName']]] < items[i]['probability']) {
            detectedSKUScores[itemtitles[items[i]['tagName']]] = items[i]['probability']
        }

        //only draw if probability is higher than 0.2 
        if (items[i].probability > 0.2) {


            ctx.restore()

            ctx.beginPath()

            ctx.moveTo(items[i].boundingBox[0] * c.width, items[i].boundingBox[1] * c.height)

            ctx.lineTo(items[i].boundingBox[2] * c.width, items[i].boundingBox[1] * c.height)

            ctx.lineTo(items[i].boundingBox[2] * c.width, items[i].boundingBox[3] * c.height)

            ctx.lineTo(items[i].boundingBox[0] * c.width, items[i].boundingBox[3] * c.height)

            ctx.lineTo(items[i].boundingBox[0] * c.width, items[i].boundingBox[1] * c.height)

            let lineYcoord = items[i].boundingBox[3] + 0.01
            let lineXcoord = (items[i].boundingBox[0] + items[i].boundingBox[2]) / 2

            ctx.fillText(
                itemtitles[items[i]['tagName']] + 'probability: ' + items[i]['probability'].toString().substr(0, 3),
                lineXcoord * c.width,
                lineYcoord * c.height
            )

            ctx.stroke()

            let html = ''
            html += '<th> SKU </th> <th> Probability </th>'

            for (var item in detectedSKUScores) {
                html += '<tr> <td> ' + item + '</td> <td> ' + detectedSKUScores[item] + '</td> </tr>'
            }

            detectedSKUScorestable.innerHTML = html
        }
    }
}

function drawHeiaLabels(items, color, titleIdentifier) {
    var c = document.getElementById('cv1')
    var ctx = c.getContext('2d')
    ctx.font = '12px Segoe UI'
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 7
    ctx.lineWidth = 3

    let detectedSKUScores = {}

    items.forEach((item) => {
        //ignore items with very low probability
        if (item['probability'] < 0.5) {
            return
        }

    
            if (detectedSKUScores[item['tagName']] == undefined) {
                detectedSKUScores[item['tagName']] = item['probability']
            } else if (detectedSKUScores[item['tagName']] < item['probability']) {
                detectedSKUScores[item['tagName']] = item['probability']
            }

            ctx.restore()
            ctx.beginPath()

            ctx.rect(
                item.boundingBox.left * c.width,
                item.boundingBox.top * c.height,
                item.boundingBox.width * c.width,
                item.boundingBox.height * c.height
            )

            ctx.fillText(
                item[titleIdentifier] + ' probability: ' + item['probability'].toString().substr(0, 3),
                item.boundingBox.left * c.width,
                item.boundingBox.top * c.height + item.boundingBox.height * c.height + 24
            )
            ctx.stroke()
        
    })

    let html = ''
    html += '<th> Item </th> <th> Probability </th>'

    for (var item in detectedSKUScores) {
        html += '<tr> <td> ' + item + '</td> <td> ' + detectedSKUScores[item] + '</td> </tr>'
    }

    detectedSKUScorestable.innerHTML = html
}

async function drawLabels(data) {
    data = JSON.parse(data)
    var c = document.getElementById('cv1')
    var ctx = c.getContext('2d')

    ctx.clearRect(0, 0, c.width, c.height)

    if (data.predictions != undefined) {
        drawHeiaLabels(data.predictions, '#FFB900', 'tagName')
    }
}

let totalReqs = 0
let secondsPassed = 0
let rollingTotalReqs = []
let rollingAverage = 0
let fpsticker = document.getElementById('fps')

function calculateRollingAverage() {
    let sum = 0
    rollingTotalReqs.forEach((num) => {
        sum += num
    })

    rollingAverage = sum / rollingTotalReqs.length
    fpsticker.innerHTML = rollingAverage
}
function resetRequestCount() {
    rollingTotalReqs[secondsPassed] = totalReqs

    if (secondsPassed % 5 == 0) {
        secondsPassed = 0
    }

    secondsPassed += 1
    totalReqs = 0
    calculateRollingAverage()
}

function sendImageToAzure(blob) {
    if (logging) console.log('send img to az ', blob.size)

    startSendTime = Date.now()

    totalReqs += 1
    reqsSincePause += 1

    sock.emit('image', blob, (ack) => {
        endSendTime = Date.now()
        if (logging) console.log(endSendTime - startSendTime, ' total time to send frame ')

        if (logging) console.log(endSendTime - startGrabFrameTime, ' total time to compress + send frames')
    })

    loop()
}

window.addEventListener(
    'load',
    function () {
        loadLabelsClasses()
    },
    false
)

makeDummy().then(function () {
  
    
    setTimeout(loop, 2000)
}).catch(function(e) {
 
    document.getElementById("loader").style="display: none";
    document.getElementById("analyzeLocalCheckbox").disabled=true
    document.getElementById("predictLocalLabel").innerHTML="Could not find model at /model.json."
})



setInterval(resetRequestCount, 1000)

let sock = null

axios.get('/setupSocketConnection').then(function (res) {
    sock = io('/' + res.data)

    sock.on('labels', function (labels) {
        drawLabels(labels)
    })
})
