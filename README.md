# CustomVisionRealTime
"Realtime" Custom Vision Demo

This repository contains a demonstration of Microsoft Custom Vision, https://customvision.ai

It allows a user to use a phone or webcam to, in realtime, label images and see the results of it overlayed on your screen. It uses the MediaDevices API to connect to cameras.

![](example.gif)

Two examples are included. A simple HTML + Javascript demo, and a slightly more complex NodeJS/HTML/JS demo.

Prerequisites: 

1. NodeJS for the NodeJS demo. 
1. A customvision account
1. A customvision key
1. A customvision endpoint


To obtain your CustomVision endpoint URL + Key, complete the following steps (from https://customvision.ai): 
1. Upload images
1. Label these images  
1. Train the model 
1. Go to the "Performance" tab in the CustomVision portal
1. Click the desired iteration of your model and click "Publish" in the top left corner

## HTML/JS Demo

Sends requests straight to the CustomVision API. **Endpoint + key are provided by the user. Use with care**. 

You can host this yourself, but you may need to use a server of some kind because your webcam might not work if you don't apply ssl encryption.



## NodeJS/HTML/JS Demo
Uses Socket.IO to send images to the server and receive labels from the server. 

Advantage of socket.io is that it supports more than 6 simultaneous requests (your browser only supports 6 concurrent requests to the same destination).

Endpoint + key are provided through config.json file.

Can use TensorflowJS to analyze the images locally. 

You will need to download the model through the CustomVision interface and serve the file to the client (default path is /model.json). 

To run:

1. Obtain customvision key + url and create config.json file (see config-example.json for format)
1. NPM install 
1. NPM run dev
1. Visit localhost:8080









