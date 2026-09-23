# Courses on YouTube

Álvaro Lozano-Robledo's lecture courses and CTNT mini-courses from the
[MathAndCobb YouTube channel](https://www.youtube.com/channel/UCsl3cpHnDaFTYnV66g8MB0A/playlists),
in one page. Every course and lecture links straight to YouTube.

Live at **https://alozanoroble.github.io/courses/**

- `scripts/data-courses.json`: which playlists appear, in what order, with titles and lecturers.
- `scripts/fetch_courses.py`: reads each playlist from YouTube (no API key) into `site/courses.json`.
- `.github/workflows/pages.yml`: refreshes daily and deploys `site/` to GitHub Pages.
