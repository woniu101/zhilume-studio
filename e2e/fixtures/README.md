# Media layout fixtures

Locally generated FFmpeg `testsrc2` patterns, not user media. The MP4 fixtures
contain two seconds of H.264/yuv420p at 12 fps, without audio.

- `portrait.png`: 180 × 320 single test frame.
- `portrait.mp4`: 180 × 320 portrait video.
- `wide.mp4`: 640 × 160 wide video.

These verify intrinsic geometry, proportional resizing, and control clearance
without relying on external videos or paid generation.
