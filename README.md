<h1 align="center">Splat Viewer</h1>

[Demo video](https://youtu.be/3fYRcGcWoFQ)

Record videos of gaussian splats. Features include: 
- Timeline editor (keyframes/widgets)
- Save/load timeline in json
- Preview playback and export to mp4.

## Local

Simply clone the repo and run ```go run main.go``` in ```/server```, then you can navigate to localhost:8067 to get started.

## Hosted

Go to https://splat.lagso.com, be warned video exports take x6 as long as they do on my macbook locally.

# Design

### 1. Path

Creating a new frame adds a new frame object to the global list of frames. Each frame has a timestamp, the camera position, and the camera quaternion (orientation), which is all you need to replicate the exact POV of the user in my case.

These 3 things translate nicely to JSON as well: the timestamp as an integer, the position as an object with keys x,y,z, and the quaternion as a Array(4). This allows users to save their projects.

Frames stay sorted by timestamp, allowing us to quickly access the start/end points of the video from frames[0].timestamp and frames[frames.length - 1].timestamp.

### 2. Export pipeline

When the user clicks export, all other actions are put on hold to render all the frames. This process consists of a while loop making sure to render a frame each 1/30 seconds, giving it only a small moment to draw to the canvas by requesting an animation frame.

Before we send any frame however, we alert the Go server listening on :8067/start that we want to start a new video export with the number of frames we will send. This creates a new sync.WaitGroup, so now we are ready to start sending frames.

After the WaitGroup has been created, we punt all the frames over as fast as possible to :8067/frame, then call :8067/finish to say we want our .mp4 file. The finish process waits on the WaitGroup for all the frames to be processed and saved with their respective file names as indices.

Finally, we use FFmpeg to create a .mp4 file, deleting all our associated images. The POST returns a url to download the .mp4, and the client accesses it ending the export.

#### 2.1 Note

I recognize that for a local tool you don't need to send back a url, I wanted to make it hosted on a domain though since its a bit cooler.

Since we need a WaitGroup for each user, each client makes a request with a unique token used as a key to access their Waitgroup in a map. Each video is saved to a directory associated with their token, and deleted after 60 seconds.

### 3. Performance

Aside from the obvious rendering of the splats, I'd say rendering a 1280x720 canvas to PNG every frame is the next biggest bottleneck. Not so much for the client, but over the network this will be very expensive especially the biggest your canvas gets. This could cause UI freezing, network timeouts, and definetely high cloud costs for me.

There are also a some possible Deadlock scenarios, but most of that stuff requires a nefarious client.

If the resolution was any bigger I probably would've opted to make the project local and just keep the video file rather then having the client download it.





