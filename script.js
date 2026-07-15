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

// FormSubmit's AJAX endpoint delivers the signup without navigating away.
// The standard endpoint remains configured as a fallback if JavaScript fails.
const SIGNUP_ENDPOINT = "https://formsubmit.co/ajax/ethan.wang@nyu.edu";
const SIGNUP_FALLBACK_ENDPOINT = "https://formsubmit.co/ethan.wang@nyu.edu";

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

  form.action = SIGNUP_FALLBACK_ENDPOINT;
  form.method = "POST";

  const honeypot = form.querySelector('[name="company_website"]');
  if (honeypot) honeypot.name = "_honey";

  setHiddenField("_template", "table");
  setHiddenField("_url", window.location.href);
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
  field.addEventListener("input", () => {
    field.classList.remove("is-invalid");

    if (formStatus?.classList.contains("is-success")) {
      setStatus("");
      if (submitButton) submitButton.disabled = false;
      if (buttonLabel) {
        buttonLabel.textContent = roleButtonCopy[roleInput?.value] || roleButtonCopy["I need compute"];
      }
    }
  });
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  if (!validateForm()) return;

  const formData = new FormData(form);
  if (formData.get("_honey")) return;

  setHiddenField("_subject", `New Rete beta signup — ${roleInput?.value || "I need compute"}`);
  formData.set("_subject", `New Rete beta signup — ${roleInput?.value || "I need compute"}`);

  if (submitButton) submitButton.disabled = true;
  const originalLabel = buttonLabel?.textContent || "Submit";
  if (buttonLabel) buttonLabel.textContent = "Submitting…";

  let submitted = false;

  try {
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });

    const responseText = await response.text();
    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error("FormSubmit returned an unreadable response.");
    }

    const confirmed = result.success === true || String(result.success).toLowerCase() === "true";
    if (!response.ok || !confirmed) {
      throw new Error(result.message || `Submission failed with status ${response.status}.`);
    }

    submitted = true;
    form.reset();
    selectRole("I need compute");
    setStatus("Submitted. We’ll contact you as beta capacity opens.", "success");
    if (buttonLabel) buttonLabel.textContent = "Submitted";
  } catch (error) {
    console.error(error);
    setStatus(
      "The signup could not be submitted. Please try again or email ethan.wang@nyu.edu.",
      "error",
    );
  } finally {
    if (!submitted) {
      if (submitButton) submitButton.disabled = false;
      if (buttonLabel) buttonLabel.textContent = originalLabel;
    }
  }
});