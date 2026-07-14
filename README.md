# Rete Website

A responsive pre-launch landing page for **Rete**, a compute-sharing marketplace that connects people who need GPU capacity with people who have idle hardware.

## What is included

- Blue-and-white editorial landing page
- Separate calls to action for compute users and GPU providers
- Responsive mobile and desktop layouts
- Private-beta signup form with validation and spam protection
- Scroll reveals, an animated network graphic, and accessible reduced-motion support
- No build step or framework required

## Run locally

Open `index.html` directly, or serve the directory with any static server:

```bash
python -m http.server 3000
```

Then open `http://localhost:3000`.

## Signup delivery

The form submits through FormSubmit to the project contact address configured in `script.js`. FormSubmit normally sends a one-time activation email after the first submission. Confirm that email before relying on the form for beta applications.

For production, replace `SIGNUP_ENDPOINT` in `script.js` with a dedicated waitlist service or your own API endpoint.

## Deploy

The site can be deployed as a static project on Vercel, Netlify, Cloudflare Pages, or GitHub Pages. No build command is needed; publish the repository root.
