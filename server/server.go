package main

import (
	"log"
	"os"
	"io"
	"fmt"
	"sync"
	"time"
	"net/http"
	"os/exec"
	"strconv"
	"path/filepath"
)

func disableCors(w http.ResponseWriter) {
	w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
}

var fs http.Handler
func serveSite(w http.ResponseWriter, r *http.Request) {
	disableCors(w)
	fs.ServeHTTP(w, r)
}

var (
	waitGroups = make(map[string]*sync.WaitGroup)
	seenFrames = make(map[string]map[int]bool)
	mu sync.Mutex
)
func startExport(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("token")
	frames, err := strconv.Atoi(r.Header.Get("frames"))
	
	if (err == nil) {
		wg := &sync.WaitGroup{}
		wg.Add(frames)
		
		mu.Lock()
		waitGroups[token] = wg
		seenFrames[token] = make(map[int]bool)
		mu.Unlock()
		
		os.Mkdir("output/" + token, 0755)
		
		// clear once done
		time.AfterFunc(60 * time.Second, func() {
			os.RemoveAll("output/" + token)
		})
	}
}
func handleFrame(w http.ResponseWriter, r *http.Request) {
	disableCors(w)
	
	token := r.Header.Get("token")
	index := r.Header.Get("index")
	intIndex, err := strconv.Atoi(index)
	
	mu.Lock()
	if err == nil && seenFrames[token] != nil {
		seen := seenFrames[token][intIndex]
		if !seen {
			waitGroups[token].Done()
			frameName := fmt.Sprintf("output/" + token + "/frame_%s.png", index)
			frame, _ := os.Create(frameName)
			io.Copy(frame, r.Body)
			frame.Close()
		}
	}
	mu.Unlock()
}
func finishExport(w http.ResponseWriter, r *http.Request) {	
	token := r.Header.Get("token")
	waitGroups[token].Wait()
	log.Println("DONE")
	
	delete(seenFrames, token)
	delete(waitGroups, token)
	
	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-framerate", "30",
		"-i", filepath.Join("output/" + token, "frame_%d.png"),
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		filepath.Join("output/" + token, "output.mp4"),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()
	
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("http://" + r.Host + "/output/" + token + "/output.mp4"))
}

func main() {
	fs = http.FileServer(http.Dir("./client"))
	http.HandleFunc("/", serveSite)
	http.HandleFunc("/start", startExport)
	http.HandleFunc("/frame", handleFrame)
	http.HandleFunc("/finish", finishExport)
	os.Mkdir("output", 0755)
	
	// users download at DOMAIN/output/TOKEN/output.mp4
	http.Handle("/output/", http.StripPrefix("/output/", http.FileServer(http.Dir("output"))))

	log.Println("Hosting files on port 67")
	err := http.ListenAndServe(":67", nil)
	if err != nil {
		log.Fatal(err)
	}
}
