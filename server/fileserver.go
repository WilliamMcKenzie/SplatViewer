package main

import (
	"log"
	"net/http"
)


var fs http.Handler
func disableCors(w http.ResponseWriter) {
	w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
}
func serveSite(w http.ResponseWriter, r *http.Request) {
	disableCors(w)
	fs.ServeHTTP(w, r)
}

func main() {
	fs = http.FileServer(http.Dir("../client"))
	http.HandleFunc("/", serveSite)

	log.Println("Hosting files on port 8089")
	err := http.ListenAndServe(":8089", nil)
	if err != nil {
		log.Fatal(err)
	}
}
