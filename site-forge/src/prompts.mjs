export function agentInstructions() {
  return `# Site Forge agent instructions\n\nThis repository is generated for direct publication. Produce a complete, polished website rather than a scaffold. Keep secrets out of source control. The required validation command is \`npm run build\`. Prefer dependable platform-native features over unnecessary services. All user-visible writing must be finished copy.\n`;
}

export function buildPrompt(userPrompt) {
  return `Build a complete, production-ready website in this empty repository. Do not ask questions. Infer sensible details from the brief and make strong design decisions.\n\nUSER BRIEF:\n${userPrompt}\n\nNON-NEGOTIABLE DELIVERY RULES:\n- Use Next.js App Router, React, TypeScript, and clean maintainable CSS. Keep dependencies modest and Vercel-compatible.\n- Create every required file, including package.json, source files, metadata, a concise README, and .gitignore.\n- The result must feel intentionally art-directed, not like a generic template. Establish a coherent type scale, spacing system, colour system, visual rhythm, and distinctive hero composition.\n- Write finished, specific copy that matches the brief. Never use lorem ipsum, TODO text, fake testimonials, fake customer logos, or unsupported claims.\n- Make every visible control functional. Include useful hover, focus, loading, error, and empty states where relevant.\n- Make the site excellent on phone, tablet, and desktop. Prevent horizontal overflow.\n- Meet accessibility fundamentals: semantic HTML, keyboard access, visible focus, labelled controls, useful alt text, sufficient contrast, and reduced-motion support.\n- Avoid remote image hotlinks. Prefer original CSS/SVG treatments, gradients used with restraint, or clearly intentional local placeholders.\n- Add strong SEO metadata and social metadata.\n- Do not expose secrets, add paid services, or require external credentials for the initial build.\n- Run any checks available locally. Leave the repository ready for npm install and npm run build.`;
}

export function critiquePrompt() {
  return `Now act as a senior product designer and front-end quality reviewer. Inspect the entire implementation you just created, then directly improve it. Fix generic visual choices, weak hierarchy, repetitive card grids, awkward mobile layouts, vague copy, inaccessible interactions, inconsistent spacing, and unfinished states. Ensure the first viewport is compelling, the composition has depth without clutter, and the site has a memorable design idea tied to the brief. Preserve technical simplicity and Vercel compatibility. Do not only describe issues; edit the files and finish the site.`;
}

export function repairPrompt(buildLog) {
  return `The production build failed. Diagnose the exact root cause from the log below, edit the repository to fix it, and keep the intended design intact. Do not merely explain.\n\nBUILD LOG:\n${buildLog}`;
}
