var constraints
var imageCapture
var mediaStream

var grabFrameButton = document.querySelector('button#grabFrame')
var takePhotoButton = document.querySelector('button#takePhoto')

var img = document.querySelector('img')
var video = document.querySelector('video')
var videoSelect = document.querySelector('select#videoSource')

var canvas = document.getElementById('cv2')
var ctx = canvas.getContext('2d')

let resizeFactor = 1
let compressionRatio = 0.9

let startGrabFrameTime = null
let endGrabFrameTime = null

let startDrawImageTime = null
let startSendAzureTime = null
let startSendTime = null
let endSendTime = null

let ratio = 2
let logging = false
let analyzeLocally = false
var itemtitles = []
let reqsSincePause = 0;
let pauseAutomatically = true;
let savePredictedImages = false;

grabFrameButton.onclick = grabFrame
takePhotoButton.onclick = takePhoto
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
    setTimeout(loop, 1000)
}

let frozen = false

function onFreezeChange(e) {
    
    if (e.checked == true) {
        freezeFrame()
    } else {
        reqsSincePause = 0;
        unFreezeFrame()
    }
}


function onPauseAutomaticallyChange(e) {
    
    if (e.checked == true) {
        pauseAutomatically = true;
    } else {
       pauseAutomatically = false;
    }
}



function onSavePredictedImagesChange(e) {
    
    if (e.checked == true) {
        savePredictedImages = true;
    } else {
        savePredictedImages = false;
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

    document.getElementById('sizeLabel').innerHTML = 'Reduce size by '  + e + " times "
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
     
    if(reqsSincePause > 250 && !frozen && pauseAutomatically) {
        document.getElementById("pausebutton").click();
    }

  try {
    if (totalReqs > 5) {
      setTimeout(function () {
        loop();
    }, 111)
    return
    }
  
    if (frozen) {
        setTimeout(function () {
            loop();
        }, 1111)
        return
    }
       
    await processOnAzure();

  }
 
  
  catch {
    setTimeout(function () {
      loop();
  }, 111)
  }

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

                      if (logging)
                          console.log(startSendAzureTime - startDrawImageTime, ' total time required to make image into blob + compress')
                      sendImageToAzure(blob)
                  },
                  'image/jpeg',
                  compressionRatio
              )
          
      })
      .catch(function (error) {
          console.log('errored on', error)
          setTimeout(function () {
              grabFrame()
          }, 1000)
      })

}

let detectedSKUScorestable = document.getElementById('skutable')

function drawItemLabels(items, color, titleIdentifier) {

    var c = document.getElementById('cv1')
    var ctx = c.getContext('2d')
    ctx.font = '12px Segoe UI'
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 7
    ctx.lineWidth = 3;

    let detectedSKUScores = {}

    items.forEach((item) => {

        //ignore items with very low probability
        if (item['probability'] < 0.5) {
            return
        }

         //ignore "Auto Generated" tags
        if (item['tagName'] == "[Auto-Generated] Other Products") {
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
                item[titleIdentifier] + " probability: " + item["probability"].toString().substr(0, 3),
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
    var c = document.getElementById('cv1')
    var ctx = c.getContext('2d')

    ctx.clearRect(0, 0, c.width, c.height)
    
    data = data.data;

    if (data.predictions != undefined) {
        drawItemLabels( data.predictions, '#FFB900', 'tagName')
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

let endpointUrl = localStorage.getItem("url");
let endpointKey = localStorage.getItem("key");

document.getElementById("url").setAttribute("value", endpointUrl);
document.getElementById("key").setAttribute("value", endpointKey);


function sendImageToAzure(blob) {
    if (logging) console.log('send img to az ', blob.size)

    startSendTime = Date.now()

    totalReqs += 1
    reqsSincePause += 1
    
    let headers =  {
        'Content-Type' : 'application/octet-stream',
        'Prediction-Key': endpointKey
      }


    axios.post(endpointUrl, blob, {headers: headers}).then(response => {
        drawLabels(response);
        totalReqs -= 1;
      }).catch(error => {
        totalReqs -= 1;
      
      })

    if (logging) console.log(endSendTime - startSendTime, ' total time to send frame ')

    if (logging) console.log(endSendTime - startGrabFrameTime, ' total time to compress + send frames')

    loop();
   
}

function setEndpointKey(value) {
    endpointKey = value;
}


function setEndpointUrl(value) {
    endpointUrl = value;
}


function saveEndpointKey(value) {
    localStorage.setItem("key", endpointKey);
}


function saveEndpointUrl(value) {
    localStorage.setItem("url", endpointUrl);
}
