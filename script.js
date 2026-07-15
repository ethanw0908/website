const header = document.querySelector("[data-header]");
const form = document.querySelector("#waitlist-form");
const roleInput = document.querySelector("#role");
const roleOptions = [...document.querySelectorAll("[data-role]")];
const roleLinks = [...document.querySelectorAll("[data-role-link]")];
const formStatus = document.querySelector("#form-status");
const submitButton = form?.querySelector('button[type="submit"]');
const buttonLabel = submitButton?.querySelector(".button-label");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) document.documentElement.style.scrollBehavior = "smooth";

// Use FormSubmit's standard browser POST flow so activation, CAPTCHA, and
// delivery errors are visible instead of being hidden behind an AJAX response.
const SIGNUP_ENDPOINT = "https://formsubmit.co/ethan.wang@nyu.edu";

const roleButtonCopy = {
  "I need compute": "Join the private beta",
  "I have compute": "Apply as a provider",
};

function setHiddenField(name, value) {
  if (!form) return;

  let field = form.querySelector(`input[name="${name}"]`);
  if (!field) {
    field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    form.append(field);
  }

  field.value = value;
}

function configureFormSubmit() {
  if (!form) return;

  form.action = SIGNUP_ENDPOINT;
  form.method = "POST";

  const honeypot = form.querySelector('[name="company_website"]');
  if (honeypot) honeypot.name = "_honey";

  const pageUrl = new URL(window.location.href);
  pageUrl.searchParams.delete("submitted");
  pageUrl.hash = "";

  const returnUrl = new URL(pageUrl.href);
  returnUrl.searchParams.set("submitted", "1");
  returnUrl.hash = "waitlist";

  setHiddenField("_template", "table");
  setHiddenField("_url", pageUrl.href);
  setHiddenField("_next", returnUrl.href);
  setHiddenField("_subject", "New Rete beta signup — I need compute");
}

function selectRole(role) {
  if (!roleInput || !roleButtonCopy[role]) return;

  roleInput.value = role;
  roleOptions.forEach((option) => {
    const isActive = option.dataset.role === role;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });

  setHiddenField("_subject", `New Rete beta signup — ${role}`);
  if (buttonLabel) buttonLabel.textContent = roleButtonCopy[role];
}

configureFormSubmit();

roleOptions.forEach((option) => {
  option.setAttribute("aria-pressed", String(option.classList.contains("is-active")));
  option.addEventListener("click", () => selectRole(option.dataset.role));
});

roleLinks.forEach((link) => {
  link.addEventListener("click", () => selectRole(link.dataset.roleLink));
});

window.addEventListener(
  "scroll",
  () => header?.classList.toggle("is-scrolled", window.scrollY > 12),
  { passive: true },
);

const revealElements = [...document.querySelectorAll(".reveal")];

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px" },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

function setStatus(message, type = "") {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.className = `form-status${type ? ` is-${type}` : ""}`;
}

function validateForm() {
  const requiredFields = [...form.querySelectorAll("[required]")];
  let firstInvalid = null;

  requiredFields.forEach((field) => {
    const isValid = field.checkValidity();
    field.classList.toggle("is-invalid", !isValid);
    if (!isValid && !firstInvalid) firstInvalid = field;
  });

  if (firstInvalid) {
    firstInvalid.focus();
    setStatus("Please enter your name and a valid email address.", "error");
    return false;
  }

  return true;
}

form?.querySelectorAll("input, textarea").forEach((field) => {
  field.addEventListener("input", () => field.classList.remove("is-invalid"));
});

form?.addEventListener("submit", (event) => {
  setStatus("");

  if (!validateForm()) {
    event.preventDefault();
    return;
  }

  const honeypot = form.querySelector('[name="_honey"]');
  if (honeypot?.value) {
    event.preventDefault();
    return;
  }

  setHiddenField("_subject", `New Rete beta signup — ${roleInput?.value || "I need compute"}`);

  if (submitButton) submitButton.disabled = true;
  if (buttonLabel) buttonLabel.textContent = "Continuing…";
});

const query = new URLSearchParams(window.location.search);
if (query.get("submitted") === "1") {
  setStatus("You’re on the list. We’ll contact you as beta capacity opens.", "success");

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("submitted");
  window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}

window.addEventListener("pageshow", () => {
  if (submitButton) submitButton.disabled = false;
  if (buttonLabel && !formStatus?.classList.contains("is-success")) {
    buttonLabel.textContent = roleButtonCopy[roleInput?.value] || roleButtonCopy["I need compute"];
  }
});