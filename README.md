# Page Studio

Page Studio is the page-editing companion for the Ocean Liner Curator suite. It provides a mobile- and iPad-friendly workspace for opening an OceanLiners.net page, previewing it, editing its HTML, saving a local draft, and downloading the revised file.

## Current MVP

- Load a public page URL when cross-origin access is allowed
- Open a local `.html` file directly in the browser
- Live, Code, and Split views
- Desktop, tablet, and mobile preview widths
- Automatic preview refresh while editing
- Local device draft storage
- Basic HTML formatting
- Download revised HTML
- GitHub publishing fields prepared for a later authenticated backend

## Safety model

Page Studio never modifies the production website directly. Editing happens inside a sandboxed preview. Publishing remains a deliberate, separate step.

## Run locally

Serve the repository as static files. For example, GitHub Pages can publish directly from the `main` branch root.

## Important limitation

Many websites block browser-side cross-origin source fetching. When that occurs, Page Studio can display the live page but cannot import its source. Opening the repository HTML file directly works now. A future Cloudflare Worker or GitHub-backed loader can provide secure page retrieval and pull-request publishing.
