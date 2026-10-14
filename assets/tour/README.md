# Homepage video tour

Drop recorded tutorial videos (MP4/WebM) in this folder and list them in `tour.json`:

```json
{
  "videos": [
    { "src": "./assets/tour/welcome.mp4", "title": "Welcome to OFS Domains", "poster": "./assets/tour/welcome.jpg", "captions": "./assets/tour/welcome.vtt" }
  ]
}
```

Any length works — the player reads each video's duration, plays them in order, and shows chapters when there is more than one.
`poster` and `captions` (WebVTT) are optional. While the list is empty, the homepage plays the built-in narrated tour instead.
